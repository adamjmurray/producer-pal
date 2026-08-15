// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * High-level arrangement clip tiling orchestrators.
 * Creates partial tiles and tiles clips across ranges.
 */

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { type TilingContext } from "./arrangement-tiling-helpers.ts";
import {
  adjustClipPreRoll,
  createShortenedClipInHolding,
} from "./arrangement-tiling-holding.ts";
import {
  clearArrangementRange,
  clearClipAtDuplicateTarget,
  moveClipFromHolding,
  sourceOverlapsTarget,
} from "./arrangement-tiling-workaround.ts";

/** Beat tolerance for length comparisons, matching the tiling remainder check. */
const EPSILON = 0.001;

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
 * @param targetIsEmpty - Caller guarantees the target span is already clear
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
  targetIsEmpty = false,
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
 * Clear the whole span about to be tiled, in one pass, when that's equivalent to
 * clearing it tile by tile.
 *
 * Per-tile clearing scanned every arrangement clip on the track and built a
 * LiveAPI per clip, so a long stretch cost O(tiles x clips) object builds — the
 * superlinear blowup that timed big arrangementLength calls out. One wide pass
 * removes exactly the same clips (see clearArrangementRange).
 *
 * Two cases keep the per-tile clear, because a wide pass would get them wrong: a
 * source longer than the tile spacing (a tile is a copy of the source, so it
 * would land on the previous tile, and only the per-tile clear trims that), and
 * a source sitting inside the span (a wide clear would trim the very clip being
 * copied). Neither happens today — every caller tiles forward from the source's
 * end at exactly the source's length.
 *
 * @param sourceClip - LiveAPI clip instance being tiled
 * @param track - LiveAPI track instance
 * @param startPosition - Start of the span to be tiled, in beats
 * @param totalLength - Length of the span to be tiled, in beats
 * @param arrangementTileLength - Spacing between tiles, in beats
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context object with silenceWavPath for audio clips
 * @returns true if the span was cleared and per-tile clears can be skipped
 */
function preClearTiledSpan(
  sourceClip: LiveAPI,
  track: LiveAPI,
  startPosition: number,
  totalLength: number,
  arrangementTileLength: number,
  isMidiClip: boolean,
  context: TilingContext,
): boolean {
  const sourceStart = sourceClip.getProperty("start_time") as number;
  const sourceEnd = sourceClip.getProperty("end_time") as number;

  if (
    sourceEnd - sourceStart > arrangementTileLength + EPSILON ||
    sourceOverlapsTarget(sourceClip.id, startPosition, totalLength)
  ) {
    return false;
  }

  clearArrangementRange(
    track,
    startPosition,
    startPosition + totalLength,
    isMidiClip,
    context,
  );

  return true;
}

/**
 * Whether tiling should stop now, warning about what it managed to place.
 *
 * The Node-side timeout replaces the whole response with an error, so a run that
 * overshoots tells the caller nothing about the tiles that did land. Stopping
 * just short keeps the partial result and says how far it got.
 *
 * @param context - Context object carrying the request deadline
 * @param sourceClipId - ID of the clip being lengthened, for the warning
 * @param placed - Tiles placed so far
 * @param total - Tiles the run set out to place
 * @param reached - Beat position tiling has filled up to
 * @param target - Beat position tiling was aiming for
 * @returns true if the deadline has passed and the caller should stop
 */
function outOfTime(
  context: TilingContext,
  sourceClipId: string,
  placed: number,
  total: number,
  reached: number,
  target: number,
): boolean {
  if (!isDeadlineExceeded(context.deadline ?? null)) return false;

  console.warn(
    `Ran out of time while lengthening clip ${sourceClipId}: placed ${placed} of ${total} tiles, ` +
      `reaching ${reached} beats instead of ${target}. Re-run to continue.`,
  );

  return true;
}

interface CreateFullTilesArgs {
  /** Collects the created tiles; appended to in place */
  createdClips: CreatedClip[];
  context: TilingContext;
  sourceClipId: string;
  trackIndex: number;
  isMidiClip: boolean;
  /** Whether the span was already cleared, so per-tile clears can be skipped */
  canPreClear: boolean;
  fullTiles: number;
  startPosition: number;
  totalLength: number;
  arrangementTileLength: number;
  startOffset: number;
  clipLoopStart: number;
  clipLoopEnd: number;
  clipLength: number;
  adjustPreRoll: boolean;
}

interface FullTilesResult {
  /** True when the deadline cut the run short */
  stoppedEarly: boolean;
  /** Beat position after the last tile, where a partial tile would go */
  endPosition: number;
  /** Content offset after the last tile */
  endContentOffset: number;
}

/**
 * Place the full-length tiles, left to right.
 *
 * Tiles that can't be placed are skipped rather than failing the run: the source
 * sitting on the target, or Ableton silently refusing the duplicate. Either way
 * the position still advances, so later tiles land where they should.
 *
 * @param args - Tiling parameters
 * @returns Where tiling got to, and whether the deadline stopped it
 */
function createFullTiles(args: CreateFullTilesArgs): FullTilesResult {
  const { createdClips, context, sourceClipId, trackIndex, isMidiClip } = args;
  const { canPreClear, fullTiles, startPosition, totalLength } = args;
  const { arrangementTileLength, clipLoopStart, clipLoopEnd } = args;
  const { clipLength, adjustPreRoll } = args;

  let currentPosition = startPosition;
  let currentContentOffset = args.startOffset;

  for (let i = 0; i < fullTiles; i++) {
    if (
      outOfTime(
        context,
        sourceClipId,
        i,
        fullTiles,
        currentPosition,
        startPosition + totalLength,
      )
    ) {
      return {
        stoppedEarly: true,
        endPosition: currentPosition,
        endContentOffset: currentContentOffset,
      };
    }

    // Create fresh track object for each iteration to avoid staleness issues
    const freshTrack = LiveAPI.from(livePath.track(trackIndex));

    // Full tiles ALWAYS use simple duplication (regardless of arrangementTileLength vs clipLength)
    // After a pre-clear the span is already empty, so all that's left is the
    // source's own self-overlap check — three property reads, no track scan.
    const safeToTile = canPreClear
      ? !sourceOverlapsTarget(
          sourceClipId,
          currentPosition,
          arrangementTileLength,
        )
      : clearClipAtDuplicateTarget(
          freshTrack,
          sourceClipId,
          currentPosition,
          isMidiClip,
          context,
        );

    // Source overlaps this tile position (the source clip already occupies it):
    // skip this tile rather than corrupt the source or crash Ableton. Tiling
    // fills the range around the source, so a self-overlapping tile is expected.
    if (safeToTile) {
      const placed = placeTile({
        freshTrack,
        sourceClipId,
        currentPosition,
        currentContentOffset,
        clipLoopStart,
        clipLoopEnd,
        clipLength,
        isMidiClip,
        adjustPreRoll,
        context,
      });

      if (placed != null) createdClips.push(placed);
    }

    currentPosition += arrangementTileLength; // Space tiles at arrangement intervals
    currentContentOffset += arrangementTileLength; // Advance through content
  }

  return {
    stoppedEarly: false,
    endPosition: currentPosition,
    endContentOffset: currentContentOffset,
  };
}

interface PlaceTileArgs {
  freshTrack: LiveAPI;
  sourceClipId: string;
  currentPosition: number;
  currentContentOffset: number;
  clipLoopStart: number;
  clipLoopEnd: number;
  clipLength: number;
  isMidiClip: boolean;
  adjustPreRoll: boolean;
  context: TilingContext;
}

/**
 * Duplicate the source to one tile position and point it at the right content.
 * @param args - Placement parameters
 * @returns The created tile, or null if Ableton refused the duplicate
 */
function placeTile(args: PlaceTileArgs): CreatedClip | null {
  const { freshTrack, sourceClipId, currentPosition, context } = args;
  const { clipLoopStart, clipLoopEnd, clipLength, isMidiClip } = args;

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

    return null;
  }

  const clipId = tileClip.id;

  // Recreate LiveAPI object with fresh reference
  const freshClip = LiveAPI.from(toLiveApiId(clipId));

  // Set start_marker to show correct portion of clip content
  let tileStartMarker =
    clipLoopStart + (args.currentContentOffset % clipLength);

  // Wrap start_marker if it would equal or exceed loop_end
  if (tileStartMarker >= clipLoopEnd) {
    tileStartMarker = clipLoopStart;
  }

  // Try setting on fresh clip object
  freshClip.set("start_marker", tileStartMarker);

  // Adjust pre-roll for subsequent tiles if requested
  if (args.adjustPreRoll) {
    adjustClipPreRoll(freshClip, freshTrack, isMidiClip, context);
  }

  return { id: clipId };
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

  const canPreClear = preClearTiledSpan(
    sourceClip,
    track,
    startPosition,
    totalLength,
    arrangementTileLength,
    isMidiClip,
    context,
  );

  const {
    stoppedEarly,
    endPosition: currentPosition,
    endContentOffset: currentContentOffset,
  } = createFullTiles({
    createdClips,
    context,
    sourceClipId,
    trackIndex: trackIndex as number,
    isMidiClip,
    canPreClear,
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
        canPreClear,
      );

      createdClips.push({ id: partialTile.id });
    }
  }

  return createdClips;
}
