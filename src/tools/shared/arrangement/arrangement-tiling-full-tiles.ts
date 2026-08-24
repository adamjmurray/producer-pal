// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The full-length tile loop: clears the span a window ahead of the tiles that
 * fill it, and stops on the request deadline without leaving a hole.
 */

import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { isDeadlineExceeded } from "#src/tools/clip/helpers/loop-deadline.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import {
  type CreatedClip,
  type TilingContext,
} from "./arrangement-tiling-helpers.ts";
import { adjustClipPreRoll } from "./arrangement-tiling-holding.ts";
import {
  clearArrangementRange,
  clearClipAtDuplicateTarget,
  sourceOverlapsTarget,
} from "./arrangement-tiling-workaround.ts";

/**
 * How many tiles' worth of span one clear empties, ahead of the tiles that
 * fill it.
 *
 * Clearing empties a span before anything refills it, so a run that clears the
 * whole span and then stops on the deadline leaves the unreached part as a
 * hole. A window at a time removes that: the loop only stops at a window
 * boundary, where everything cleared is already filled. Still far fewer track
 * scans than one per tile, which is what made a long stretch superlinear.
 */
const TILES_PER_CLEAR_WINDOW = 8;

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
export function outOfTime(
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
  /** Clear a window ahead of the tiles, rather than once per tile placed */
  clearAhead: boolean;
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
  /** Beat position after the last tile placed */
  endPosition: number;
  /** Content offset after the last tile */
  endContentOffset: number;
  /** Beat position cleared up to (startPosition when not clearing ahead) */
  clearedThrough: number;
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
export function createFullTiles(args: CreateFullTilesArgs): FullTilesResult {
  const {
    createdClips,
    context,
    sourceClipId,
    trackIndex,
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
  } = args;

  const spanEnd = startPosition + totalLength;

  let currentPosition = startPosition;
  let currentContentOffset = startOffset;
  let clearedThrough = startPosition;

  for (let i = 0; i < fullTiles; i++) {
    const startsWindow = i % TILES_PER_CLEAR_WINDOW === 0;

    // Stop only where nothing cleared is still empty: at any tile when clearing
    // per tile, at window boundaries when clearing ahead.
    if (
      (!clearAhead || startsWindow) &&
      outOfTime(
        context,
        sourceClipId,
        createdClips.length,
        fullTiles,
        currentPosition,
        spanEnd,
      )
    ) {
      return {
        stoppedEarly: true,
        endPosition: currentPosition,
        endContentOffset: currentContentOffset,
        clearedThrough,
      };
    }

    // Create fresh track object for each iteration to avoid staleness issues
    const freshTrack = LiveAPI.from(livePath.track(trackIndex));

    if (clearAhead && startsWindow) {
      clearedThrough = Math.min(
        currentPosition + TILES_PER_CLEAR_WINDOW * arrangementTileLength,
        spanEnd,
      );
      clearArrangementRange(
        freshTrack,
        currentPosition,
        clearedThrough,
        isMidiClip,
        context,
      );
    }

    // Full tiles ALWAYS use simple duplication (regardless of arrangementTileLength vs clipLength).
    // The window is already empty, so only the source's own overlap can block a
    // tile — and checking that needs no track scan.
    const safeToTile = clearAhead
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

    // A false safeToTile means the source itself occupies this position, so
    // the tile is skipped rather than corrupting the source or crashing Live.
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
    clearedThrough,
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
  const {
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
  } = args;

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

  return { id: clipId };
}
