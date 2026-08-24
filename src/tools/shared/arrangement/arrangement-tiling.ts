// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * High-level arrangement clip tiling orchestrators.
 * Creates partial tiles and tiles clips across ranges.
 */

import * as console from "#src/shared/max/v8-max-console.ts";
import { createFullTiles, outOfTime } from "./arrangement-tiling-full-tiles.ts";
import {
  type CreatedClip,
  EPSILON,
  type TilingContext,
} from "./arrangement-tiling-helpers.ts";
import {
  adjustClipPreRoll,
  createShortenedClipInHolding,
} from "./arrangement-tiling-holding.ts";
import {
  canClearTiledSpan,
  clearArrangementRange,
  holdingAreaStartOnTrack,
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

interface PartialTileOptions {
  /** Whether to adjust pre-roll on the created tile */
  adjustPreRoll?: boolean;
  /** Content offset in beats for start_marker */
  contentOffset?: number;
  /** Caller guarantees the target span is already clear */
  targetIsEmpty?: boolean;
}

/**
 * Creates a partial tile of a clip at a target position.
 * Combines: create shortened clip in holding → move to target → optionally adjust pre-roll.
 *
 * @param sourceClip - LiveAPI clip instance to tile
 * @param track - LiveAPI track instance
 * @param targetPosition - Target position in beats
 * @param partialLength - Length of partial tile in beats
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 * @param options - Configuration options
 * @param options.adjustPreRoll - Whether to adjust pre-roll on the created tile
 * @param options.contentOffset - Content offset in beats for start_marker
 * @param options.targetIsEmpty - Caller guarantees nothing occupies the target,
 *   skipping the clear that exists to stop Ableton crashing on an overlap. Only
 *   pass true for a span already cleared or just vacated.
 * @returns The created partial tile clip (LiveAPI instance)
 */
export function createPartialTile(
  sourceClip: LiveAPI,
  track: LiveAPI,
  targetPosition: number,
  partialLength: number,
  isMidiClip: boolean,
  context: TilingContext,
  {
    adjustPreRoll = true,
    contentOffset = 0,
    targetIsEmpty = false,
  }: PartialTileOptions = {},
): LiveAPI {
  // Read from the track, not from a start captured earlier in the request: a
  // tile this same run already placed may sit where a stale holding area
  // points. Keep it clear of this tile's own span too.
  const holdingStart = holdingAreaStartOnTrack(
    track,
    targetPosition + partialLength,
  );

  // Create shortened clip in holding area
  const { holdingClipId } = createShortenedClipInHolding(
    sourceClip,
    track,
    partialLength,
    holdingStart,
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
    targetIsEmpty,
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

  // Check the deadline BEFORE clearing anything. A clear empties its span before
  // anything refills it, so bailing out after one would leave the caller with a
  // hole and no tiles to show for it — worse than not having started.
  const tileTarget = startPosition + totalLength;

  if (
    outOfTime(context, sourceClipId, 0, fullTiles, startPosition, tileTarget)
  ) {
    return createdClips;
  }

  const clearAhead = canClearTiledSpan(
    sourceClip,
    startPosition,
    totalLength,
    arrangementTileLength,
  );

  const {
    stoppedEarly,
    endPosition: currentPosition,
    endContentOffset: currentContentOffset,
    clearedThrough,
  } = createFullTiles({
    createdClips,
    context,
    sourceClipId,
    trackIndex: trackIndex as number,
    isMidiClip,
    clearAhead,
    fullTiles,
    startPosition,
    totalLength,
    arrangementTileLength,
    startOffset,
    clipLoopStart,
    clipLoopEnd,
    clipLength,
    adjustPreRoll,
  });

  if (stoppedEarly) return createdClips;

  // Handle partial final tile if remainder exists
  if (remainder > EPSILON) {
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
      // The last window stops at the last full tile when the tiles divide
      // evenly into windows, leaving the partial tile's span uncleared.
      if (clearAhead && clearedThrough < tileTarget - EPSILON) {
        clearArrangementRange(
          track,
          currentPosition,
          tileTarget,
          isMidiClip,
          context,
        );
      }

      const partialTile = createPartialTile(
        sourceClip,
        track,
        currentPosition,
        remainder,
        isMidiClip,
        context,
        {
          adjustPreRoll,
          contentOffset: currentContentOffset,
          targetIsEmpty: clearAhead,
        },
      );

      createdClips.push({ id: partialTile.id });
    }
  }

  return createdClips;
}
