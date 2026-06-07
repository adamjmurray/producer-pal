// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * High-level arrangement clip tiling orchestrators.
 * Creates partial tiles and tiles clips across ranges.
 */

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { type TilingContext } from "./arrangement-tiling-helpers.ts";
import {
  adjustClipPreRoll,
  createShortenedClipInHolding,
} from "./arrangement-tiling-holding.ts";
import {
  clearClipAtDuplicateTarget,
  moveClipFromHolding,
  sourceOverlapsTarget,
} from "./arrangement-tiling-workaround.ts";

interface TileClipOptions {
  /** Whether to adjust pre-roll on subsequent tiles */
  adjustPreRoll?: boolean;
  /** Content offset in beats to start tiling from */
  startOffset?: number;
  /** Arrangement length per tile (defaults to clip content length) */
  tileLength?: number | null;
}

interface CreatedClip {
  id: string;
}

/**
 * Creates a partial tile of a clip at a target position.
 * Combines: create shortened clip in holding → move to target → optionally adjust pre-roll.
 *
 * @param sourceClip - LiveAPI clip instance to tile
 * @param track - LiveAPI track instance
 * @param targetPosition - Target position in beats
 * @param partialLength - Length of partial tile in beats
 * @param holdingAreaStart - Start position of holding area in beats
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 * @param adjustPreRoll - Whether to adjust pre-roll on the created tile
 * @param contentOffset - Content offset in beats for start_marker
 * @returns The created partial tile clip (LiveAPI instance)
 */
export function createPartialTile(
  sourceClip: LiveAPI,
  track: LiveAPI,
  targetPosition: number,
  partialLength: number,
  holdingAreaStart: number,
  isMidiClip: boolean,
  context: TilingContext,
  adjustPreRoll = true,
  contentOffset = 0,
): LiveAPI {
  // Create shortened clip in holding area
  const { holdingClipId } = createShortenedClipInHolding(
    sourceClip,
    track,
    partialLength,
    holdingAreaStart,
    isMidiClip,
    context,
  );

  // Move from holding to target position
  const partialTile = moveClipFromHolding(
    holdingClipId,
    track,
    targetPosition,
    isMidiClip,
    context,
  );

  // Set start_marker to show correct portion of clip content
  const clipLoopStart = sourceClip.getProperty("loop_start") as number;
  const clipLoopEnd = sourceClip.getProperty("loop_end") as number;
  const clipLength = clipLoopEnd - clipLoopStart;
  const tileStartMarker = clipLoopStart + (contentOffset % clipLength);

  partialTile.set("start_marker", tileStartMarker);

  // Optionally adjust pre-roll
  if (adjustPreRoll) {
    adjustClipPreRoll(partialTile, track, isMidiClip, context);
  }

  return partialTile;
}

/**
 * Tiles a clip across a range by creating full tiles and a partial final tile.
 * High-level orchestrator that handles the complete tiling operation.
 *
 * @param sourceClip - LiveAPI clip instance to tile
 * @param track - LiveAPI track instance
 * @param startPosition - Start position for tiling in beats
 * @param totalLength - Total length to fill with tiles in beats
 * @param holdingAreaStart - Start position of holding area in beats
 * @param context - Context object with silenceWavPath for audio clips
 * @param options - Configuration options
 * @param options.adjustPreRoll - Whether to adjust pre-roll on subsequent tiles
 * @param options.startOffset - Content offset in beats to start tiling from
 * @param options.tileLength - Arrangement length per tile (defaults to clip content length)
 * @returns Array of created clip objects with id property
 */
export function tileClipToRange(
  sourceClip: LiveAPI,
  track: LiveAPI,
  startPosition: number,
  totalLength: number,
  holdingAreaStart: number,
  context: TilingContext,
  {
    adjustPreRoll = true,
    startOffset = 0,
    tileLength = null,
  }: TileClipOptions = {},
): CreatedClip[] {
  const createdClips: CreatedClip[] = [];

  // Store clip ID and track index before loop to prevent object staleness issues
  const sourceClipId = sourceClip.id;
  const trackIndex = sourceClip.trackIndex;

  // Detect if clip is MIDI or audio for proper clip creation method
  const isMidiClip = sourceClip.getProperty("is_midi_clip") === 1;

  // Get clip loop length for tiling
  const clipLoopStart = sourceClip.getProperty("loop_start") as number;
  const clipLoopEnd = sourceClip.getProperty("loop_end") as number;
  const clipLength = clipLoopEnd - clipLoopStart;

  // Safety mechanism: Ensure end_marker is set to loop_end before tiling
  // This prevents "invalid syntax" errors when setting start_marker on duplicates
  // (start_marker cannot exceed end_marker)
  const currentEndMarker = sourceClip.getProperty("end_marker") as number;

  if (currentEndMarker !== clipLoopEnd) {
    sourceClip.set("end_marker", clipLoopEnd);
  }

  // Determine arrangement length per tile (defaults to clip content length)
  const arrangementTileLength = tileLength ?? clipLength;

  // Calculate tiling requirements based on arrangement tile length
  const fullTiles = Math.floor(totalLength / arrangementTileLength);
  const remainder = totalLength % arrangementTileLength;

  // Track content offset for setting start_marker on each tile
  let currentContentOffset = startOffset;

  // Create full tiles
  let currentPosition = startPosition;

  for (let i = 0; i < fullTiles; i++) {
    // Create fresh track object for each iteration to avoid staleness issues
    const freshTrack = LiveAPI.from(livePath.track(trackIndex as number));

    // Full tiles ALWAYS use simple duplication (regardless of arrangementTileLength vs clipLength)
    const safeToTile = clearClipAtDuplicateTarget(
      freshTrack,
      sourceClipId,
      currentPosition,
      isMidiClip,
      context,
    );

    // Source overlaps this tile position (the source clip already occupies it):
    // skip this tile rather than corrupt the source or crash Ableton. Tiling
    // fills the range around the source, so a self-overlapping tile is expected.
    if (!safeToTile) {
      currentPosition += arrangementTileLength;
      currentContentOffset += arrangementTileLength;
      continue;
    }

    const result = freshTrack.call(
      "duplicate_clip_to_arrangement",
      toLiveApiId(sourceClipId),
      currentPosition,
    ) as [string, string | number];

    const tileClip = LiveAPI.from(result);

    // Skip silent failures (Ableton returning ["id", 0]) so we don't push
    // a phantom clip ID into createdClips and confuse downstream callers.
    if (!tileClip.exists()) {
      console.warn(
        `Failed to duplicate source clip for tile at ${currentPosition}, skipping`,
      );
      currentPosition += arrangementTileLength;
      currentContentOffset += arrangementTileLength;
      continue;
    }

    const clipId = tileClip.id;

    // Recreate LiveAPI object with fresh reference
    const freshClip = LiveAPI.from(toLiveApiId(clipId));

    // Set start_marker to show correct portion of clip content
    let tileStartMarker = clipLoopStart + (currentContentOffset % clipLength);

    // Wrap start_marker if it would equal or exceed loop_end
    if (tileStartMarker >= clipLoopEnd) {
      tileStartMarker = clipLoopStart;
    }

    // Try setting on fresh clip object
    freshClip.set("start_marker", tileStartMarker);

    // Adjust pre-roll for subsequent tiles if requested
    if (adjustPreRoll) {
      adjustClipPreRoll(freshClip, freshTrack, isMidiClip, context);
    }

    createdClips.push({ id: clipId });
    currentPosition += arrangementTileLength; // Space tiles at arrangement intervals
    currentContentOffset += arrangementTileLength; // Advance through content
  }

  // Handle partial final tile if remainder exists
  if (remainder > 0.001) {
    // The partial tile routes through the holding area, where
    // clearClipAtDuplicateTarget runs against the holding clip (not the source)
    // and would trim the source if it overlapped this position. Today every
    // caller tiles forward from the source's end, so this never fires — but
    // guard it so a future caller tiling over the source can't corrupt it
    // (mirrors the full-tile loop's self-overlap skip above).
    if (sourceOverlapsTarget(sourceClipId, currentPosition, remainder)) {
      console.warn(
        `Source clip overlaps the partial tile at ${currentPosition}; skipping it to avoid corrupting the source`,
      );
    } else {
      const partialTile = createPartialTile(
        sourceClip,
        track,
        currentPosition,
        remainder,
        holdingAreaStart,
        isMidiClip,
        context,
        adjustPreRoll,
        currentContentOffset,
      );

      createdClips.push({ id: partialTile.id });
    }
  }

  return createdClips;
}
