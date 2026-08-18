// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Workaround for Ableton Live duplicate_clip_to_arrangement crash bug.
 * When the source is an arrangement clip and any existing clip overlaps
 * the target position, Ableton crashes. These functions clear overlapping
 * clips before duplication and handle moving clips from holding areas.
 */

import { toLiveApiId } from "#src/tools/shared/utils.ts";
import {
  createAndDeleteTempClip,
  EPSILON,
  type TilingContext,
} from "./arrangement-tiling-helpers.ts";

/**
 * Verify a duplicate_clip_to_arrangement result and return the new clip's ID.
 * Throws if Ableton returned an invalid result (e.g. ["id", 0]) so destructive
 * follow-up steps cannot silently destroy the source clip.
 * @param result - Raw return value from track.call("duplicate_clip_to_arrangement", ...)
 * @param context - Short description of the failed operation for the error message
 * @returns The new clip's ID string
 */
function verifyDupResult(
  result: [string, string | number],
  context: string,
): string {
  const newClip = LiveAPI.from(result);

  if (!newClip.exists()) {
    throw new Error(
      `duplicate_clip_to_arrangement returned no clip for ${context}`,
    );
  }

  return newClip.id;
}

/**
 * Workaround for Ableton Live crash: duplicate_clip_to_arrangement crashes when
 * the source is an arrangement clip and any existing arrangement clip overlaps
 * the target position. Affects both MIDI and audio. Set to false to test if
 * Ableton fixed the bug, then remove this workaround when confirmed fixed.
 */
let arrangementDuplicateCrashWorkaround = true;

/**
 * Enable or disable the arrangement duplicate crash workaround.
 * @param enabled - Whether the workaround should be active
 */
export function setArrangementDuplicateCrashWorkaround(enabled: boolean): void {
  arrangementDuplicateCrashWorkaround = enabled;
}

/**
 * Clear any existing arrangement clips at the target position to prevent
 * the Ableton crash when duplicating an arrangement clip on top of them.
 * Uses the splitting technique (dup-to-holding + edge trims) to preserve
 * portions of overlapping clips outside the target range.
 *
 * No-op (returns true) when the workaround is disabled or the source is a
 * session clip. Returns FALSE when the source arrangement clip overlaps its
 * OWN target range — it cannot clear itself without destroying the content
 * being duplicated. The caller decides what to do with a false result:
 * duplicate/move route through `duplicateSelfOverlappingClip` (holding-area
 * copy → overwrite the original), while tiling skips the self-overlapping tile.
 *
 * @param track - LiveAPI track instance for the target track
 * @param sourceClipId - ID of the source clip being duplicated
 * @param targetPosition - Target position in beats
 * @param isMidiClip - Whether the track is MIDI (true) or audio (false)
 * @param context - Context with silenceWavPath for audio clip operations
 * @returns true if it is safe to duplicate the source directly to the target;
 *   false if the source overlaps its own target (caller must handle)
 */
export function clearClipAtDuplicateTarget(
  track: LiveAPI,
  sourceClipId: string,
  targetPosition: number,
  isMidiClip: boolean,
  context: TilingContext,
): boolean {
  if (!arrangementDuplicateCrashWorkaround) return true;

  const sourceClip = LiveAPI.from(toLiveApiId(sourceClipId));

  if (sourceClip.getProperty("is_arrangement_clip") !== 1) return true;

  const sourceStart = sourceClip.getProperty("start_time") as number;
  const sourceEnd = sourceClip.getProperty("end_time") as number;
  const targetEnd = targetPosition + (sourceEnd - sourceStart);

  // The source overlapping its own target is the one clip we must never clear:
  // trimming it would destroy the content being duplicated, and leaving it in
  // place would trigger Ableton's overlap crash. Report it (return false) so the
  // caller routes through the holding area (duplicateSelfOverlappingClip) or
  // skips the tile.
  //
  // Only a source on THIS track can be in the way — a cross-track source shares
  // beats with the target but not the timeline being cleared. An unknown index
  // on EITHER side counts as the same track: skipping the guard when we can't
  // tell risks the crash it exists to prevent.
  const sourceTrackIndex = sourceClip.trackIndex;
  const targetTrackIndex = track.trackIndex;
  const sourceIsOnThisTrack =
    sourceTrackIndex == null ||
    targetTrackIndex == null ||
    sourceTrackIndex === targetTrackIndex;

  if (
    sourceIsOnThisTrack &&
    sourceStart < targetEnd &&
    sourceEnd > targetPosition
  ) {
    return false;
  }

  clearArrangementRange(track, targetPosition, targetEnd, isMidiClip, context);

  return true;
}

/**
 * Clear every arrangement clip overlapping a range, preserving the portions
 * outside it. One pass handles them all: arrangement clips on a track never
 * overlap each other, so clearing one can't resurrect another.
 *
 * Scanning the track is the expensive part — it builds a `LiveAPI` per clip, and
 * within a request the pool never refills, so a caller that scans once per
 * placement pays O(placements x clips) object builds and gets superlinear. Call
 * this ONCE for the whole span you are about to fill, not once per clip you put
 * in it. Clearing [a, c) in one pass is also equivalent to clearing [a, b) then
 * [b, c): both leave the whole span empty and both preserve the same outside
 * portions, so the wider call is strictly less work.
 *
 * @param track - LiveAPI track instance
 * @param rangeStart - Start of the range to clear (beats)
 * @param rangeEnd - End of the range to clear (beats)
 * @param isMidiClip - Whether the track is MIDI (true) or audio (false)
 * @param context - Context with silenceWavPath for audio clip operations
 */
export function clearArrangementRange(
  track: LiveAPI,
  rangeStart: number,
  rangeEnd: number,
  isMidiClip: boolean,
  context: TilingContext,
): void {
  const clipIds = track.getChildIds("arrangement_clips");

  for (const clipId of clipIds) {
    const clip = LiveAPI.from(clipId);
    const clipStart = clip.getProperty("start_time") as number;
    const clipEnd = clip.getProperty("end_time") as number;

    if (clipStart < rangeEnd && clipEnd > rangeStart) {
      clearOverlappingClip(
        track,
        clip,
        rangeStart,
        rangeEnd,
        clipIds,
        isMidiClip,
        context,
      );
    }
  }
}

/**
 * Clear the whole span about to be tiled in one pass, when that is equivalent
 * to clearing it tile by tile. Returns whether the caller may then skip its
 * per-tile clears.
 *
 * Three cases keep the per-tile path, because one wide pass would get them
 * wrong: the workaround being off (per-tile clearing is a no-op then, so a wide
 * clear would delete clips Live is happy to overwrite itself), a source longer
 * than the tile spacing (a tile is a copy of the source, so it would land on
 * the previous tile and only the per-tile clear trims that), and a source
 * sitting inside the span (a wide clear would trim the very clip being copied).
 * None happens today — every caller tiles forward from the source's end at
 * exactly the source's length.
 *
 * @param sourceClip - LiveAPI clip instance being tiled
 * @param track - LiveAPI track instance
 * @param startPosition - Start of the span to be tiled, in beats
 * @param totalLength - Length of the span to be tiled, in beats
 * @param tileSpacing - Beats between consecutive tiles
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context with silenceWavPath for audio clip operations
 * @returns true if the span was cleared and per-tile clears can be skipped
 */
export function preClearTiledSpan(
  sourceClip: LiveAPI,
  track: LiveAPI,
  startPosition: number,
  totalLength: number,
  tileSpacing: number,
  isMidiClip: boolean,
  context: TilingContext,
): boolean {
  if (!arrangementDuplicateCrashWorkaround) return false;

  const sourceStart = sourceClip.getProperty("start_time") as number;
  const sourceEnd = sourceClip.getProperty("end_time") as number;

  if (
    sourceEnd - sourceStart > tileSpacing + EPSILON ||
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
 * Read-only check: would placing a clip of `targetLength` beats at
 * `targetPosition` overlap the source clip's own current range? Used to guard
 * paths that route through the holding area (e.g. partial tiles), where
 * `clearClipAtDuplicateTarget` is called with the holding clip — not the source
 * — and so would treat an overlapping source as an "other" clip and trim it.
 *
 * Same self-overlap geometry as `clearClipAtDuplicateTarget`, scoped to the
 * caller's placement length rather than the source's full length — but with no
 * track check, because tiling is same-track: `tileClipToRange` builds the tile
 * track from the source clip's own `trackIndex`, so a target-track parameter
 * would equal the source's track at every call site. A cross-track tiling
 * caller would have to add that parameter and return false when the tracks
 * differ; without it, a cross-track source reads as a self-overlap and its
 * tiles are silently skipped.
 *
 * Returns false (no special handling) when the workaround is disabled or the
 * source is a session clip, matching that function's no-op conditions.
 *
 * @param sourceClipId - ID of the source clip being duplicated/tiled
 * @param targetPosition - Target position in beats
 * @param targetLength - Length of the clip being placed in beats
 * @returns true if the source overlaps the target range (caller should skip)
 */
export function sourceOverlapsTarget(
  sourceClipId: string,
  targetPosition: number,
  targetLength: number,
): boolean {
  if (!arrangementDuplicateCrashWorkaround) return false;

  const sourceClip = LiveAPI.from(toLiveApiId(sourceClipId));

  if (sourceClip.getProperty("is_arrangement_clip") !== 1) return false;

  const sourceStart = sourceClip.getProperty("start_time") as number;
  const sourceEnd = sourceClip.getProperty("end_time") as number;
  const targetEnd = targetPosition + targetLength;

  return sourceStart < targetEnd && sourceEnd > targetPosition;
}

/**
 * Moves a clip from the holding area to a target position.
 * Duplicates the holding clip to the target, then cleans up the holding clip.
 *
 * @param holdingClipId - ID of clip in holding area
 * @param track - LiveAPI track instance
 * @param targetPosition - Target position in beats
 * @param isMidiClip - Whether the clip is MIDI (true) or audio (false)
 * @param context - Context with silenceWavPath for audio clip operations
 * @param targetIsEmpty - Caller guarantees nothing occupies the target; skips the
 *   track scan. Only pass true when the span was just vacated or already cleared
 *   — a wrong guarantee crashes Ableton, which is what the clear prevents.
 * @returns The moved clip (LiveAPI instance)
 */
export function moveClipFromHolding(
  holdingClipId: string,
  track: LiveAPI,
  targetPosition: number,
  isMidiClip: boolean,
  context: TilingContext,
  targetIsEmpty = false,
): LiveAPI {
  // Clear any *other* clip at the target before placing the holding copy. The
  // holding clip itself can never overlap the target here: callers position the
  // holding area past the target placement (see holdingAreaStartFromIds's
  // minStartBeats), so clearClipAtDuplicateTarget's self-overlap branch is
  // unreachable for the holding clip and its boolean return is safely ignored.
  if (!targetIsEmpty) {
    clearClipAtDuplicateTarget(
      track,
      holdingClipId,
      targetPosition,
      isMidiClip,
      context,
    );
  }

  const finalResult = track.call(
    "duplicate_clip_to_arrangement",
    toLiveApiId(holdingClipId),
    targetPosition,
  ) as [string, string | number];
  const movedId = verifyDupResult(
    finalResult,
    `move from holding (id ${holdingClipId}) to ${targetPosition}`,
  );
  const movedClip = LiveAPI.from(toLiveApiId(movedId));

  // Clean up holding area only after the move succeeded — otherwise we'd
  // delete the holding copy with no replacement and lose its content.
  track.call("delete_clip", toLiveApiId(holdingClipId));

  return movedClip;
}

/**
 * Place a FULL copy of a self-overlapping arrangement clip at its target.
 *
 * Direct duplication is impossible when the source overlaps its own target:
 * Ableton crashes if the overlapping source is left in place, and trimming the
 * source first would truncate the very content being copied. Instead, copy the
 * source to a far holding area first — making it an independent clip — then
 * place that copy at the target. Ableton trims the ORIGINAL (overwrite
 * semantics: e.g. a 4-bar clip duplicated +1 bar leaves a 1-bar original plus a
 * full 4-bar copy) while the placed copy stays full-length.
 *
 * Call this only when `clearClipAtDuplicateTarget` returned false (self-overlap).
 *
 * @param track - LiveAPI track instance for the target track
 * @param sourceClipId - ID of the self-overlapping source clip
 * @param targetPosition - Target position in beats
 * @param isMidiClip - Whether the track is MIDI (true) or audio (false)
 * @param context - Context with silenceWavPath for audio clip operations
 * @returns The placed full-length copy at the target (LiveAPI instance)
 */
export function duplicateSelfOverlappingClip(
  track: LiveAPI,
  sourceClipId: string,
  targetPosition: number,
  isMidiClip: boolean,
  context: TilingContext,
): LiveAPI {
  // Copy the source to a far holding area FIRST (guaranteed empty → no crash),
  // verified before anything is mutated, so the full content is preserved even
  // if Ableton returns a silent dup failure. The holding area must clear the
  // target placement (targetPosition + sourceLength), not just the existing
  // clips: a full-length copy of a >100-beat clip placed far forward would
  // otherwise land on a holding area pinned only to maxEnd, and
  // moveClipFromHolding would misread that overlap as a self-overlap and skip
  // clearing the original (re-triggering the Ableton crash).
  const sourceClip = LiveAPI.from(toLiveApiId(sourceClipId));
  const sourceLength =
    (sourceClip.getProperty("end_time") as number) -
    (sourceClip.getProperty("start_time") as number);
  const holdingStart = holdingAreaStartFromIds(
    track.getChildIds("arrangement_clips"),
    targetPosition + sourceLength,
  );
  const holdingResult = track.call(
    "duplicate_clip_to_arrangement",
    toLiveApiId(sourceClipId),
    holdingStart,
  ) as [string, string | number];
  const holdingClipId = verifyDupResult(
    holdingResult,
    `self-overlap dup-to-holding for clip ${sourceClipId} at ${holdingStart}`,
  );

  // Place the independent copy at the target. moveClipFromHolding clears the
  // ORIGINAL (now just an "other" overlapping clip), duplicates holding→target
  // as a full copy, and deletes the holding clip.
  return moveClipFromHolding(
    holdingClipId,
    track,
    targetPosition,
    isMidiClip,
    context,
  );
}

/**
 * Clear an overlapping clip from the target range, preserving any portions
 * outside the range. Handles all overlap types uniformly using the same
 * splitting technique as arrangement-splitting.ts.
 * @param track - LiveAPI track instance
 * @param overlappingClip - The clip that overlaps the target range
 * @param targetPosition - Start of the range to clear (beats)
 * @param targetEnd - End of the range to clear (beats)
 * @param allClipIds - All arrangement clip IDs on the track (for holding area calc)
 * @param isMidiClip - Whether the track is MIDI or audio
 * @param context - Context with silenceWavPath for audio clip operations
 */
function clearOverlappingClip(
  track: LiveAPI,
  overlappingClip: LiveAPI,
  targetPosition: number,
  targetEnd: number,
  allClipIds: string[],
  isMidiClip: boolean,
  context: TilingContext,
): void {
  const clipStart = overlappingClip.getProperty("start_time") as number;
  const clipEnd = overlappingClip.getProperty("end_time") as number;
  const clipId = overlappingClip.id;

  const hasBefore = clipStart < targetPosition;
  const hasAfter = clipEnd > targetEnd;

  if (!hasAfter) {
    // No "after" portion to preserve — simple handling
    if (hasBefore) {
      // Right-trim: keep before, discard at/after target
      createAndDeleteTempClip(
        track,
        targetPosition,
        clipEnd - targetPosition,
        isMidiClip,
        context,
      );
    } else {
      // Fully contained — just delete
      track.call("delete_clip", toLiveApiId(clipId));
    }

    return;
  }

  // Has "after" portion — need dup-to-holding + left-trim + move
  const holdingStart = holdingAreaStartFromIds(allClipIds);

  // Step 1: Duplicate to holding area (safe: no clips there) and verify.
  // Order matters: the original clip must remain intact until the holding
  // copy is confirmed. Otherwise a silent dup failure (Ableton returning
  // ["id", 0]) would let the later trim/delete destroy the only copy.
  const holdingResult = track.call(
    "duplicate_clip_to_arrangement",
    toLiveApiId(clipId),
    holdingStart,
  ) as [string, string | number];
  const holdingClipId = verifyDupResult(
    holdingResult,
    `dup-to-holding for clip ${clipId} at ${holdingStart}`,
  );

  // Step 2: Left-trim holding to keep only the "after" portion. This affects
  // only the holding copy (far past any real clip), so the original is still
  // safe at this point.
  const leftTrimLen = targetEnd - clipStart;

  createAndDeleteTempClip(
    track,
    holdingStart,
    leftTrimLen,
    isMidiClip,
    context,
  );

  // Step 3: Now that the "after" portion is preserved in holding, mutate
  // the original: right-trim (keep before) or delete (no before).
  if (hasBefore) {
    createAndDeleteTempClip(
      track,
      targetPosition,
      clipEnd - targetPosition,
      isMidiClip,
      context,
    );
  } else {
    track.call("delete_clip", toLiveApiId(clipId));
  }

  // Step 4: Move trimmed holding clip to its final position.
  moveClipFromHolding(holdingClipId, track, targetEnd, isMidiClip, context);
}

/**
 * Beats of empty space left past the furthest-right real clip (and any planned
 * target placement) before the holding area begins, guaranteeing the holding
 * region is empty AND cannot overlap the eventual target.
 */
const HOLDING_AREA_GAP_BEATS = 100;

/**
 * Compute a safe holding-area start position: past both the last arrangement
 * clip AND any planned target placement, guaranteeing an empty region to
 * duplicate into that also cannot overlap the eventual target.
 *
 * `minStartBeats` lets a caller that will place a full-length copy at a target
 * push the holding area past that placement's right edge (targetPosition +
 * length). Without it, a clip longer than HOLDING_AREA_GAP_BEATS duplicated far
 * enough forward would land its target copy on top of the holding clip — which
 * moveClipFromHolding's clearClipAtDuplicateTarget would then misread as a
 * self-overlap, skip clearing the original, and re-trigger the very Ableton
 * crash this module exists to prevent.
 * @param clipIds - Arrangement clip IDs to consider
 * @param minStartBeats - Earliest beat the holding area must clear (default 0)
 * @returns Holding-area start position in beats
 */
function holdingAreaStartFromIds(clipIds: string[], minStartBeats = 0): number {
  let maxEnd = 0;

  for (const id of clipIds) {
    const end = LiveAPI.from(id).getProperty("end_time") as number;

    if (end > maxEnd) maxEnd = end;
  }

  return Math.max(maxEnd, minStartBeats) + HOLDING_AREA_GAP_BEATS;
}

/**
 * Push a caller-supplied holding-area start past a placement the same request
 * is about to make.
 *
 * The context's holding area is `song_length` — the end of the arrangement as
 * it was when the request started, with no gap. Anything the request writes
 * past that point sits on top of it, so a later duplicate-to-holding lands on
 * content instead of empty space: the Ableton crash, or an overwrite that eats
 * what was just placed.
 *
 * Only a placement that runs past the holding area moves it; a request working
 * left of `song_length` keeps the start it was given.
 * @param holdingAreaStart - Holding-area start the caller was given, in beats
 * @param placementEnd - Right edge of the placement to clear, in beats
 * @returns Holding-area start position in beats
 */
export function holdingAreaStartPast(
  holdingAreaStart: number,
  placementEnd: number,
): number {
  return Math.max(holdingAreaStart, placementEnd + HOLDING_AREA_GAP_BEATS);
}
