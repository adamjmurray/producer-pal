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
 * No-op when: workaround is disabled or source is a session clip.
 * @param track - LiveAPI track instance for the target track
 * @param sourceClipId - ID of the source clip being duplicated
 * @param targetPosition - Target position in beats
 * @param isMidiClip - Whether the track is MIDI (true) or audio (false)
 * @param context - Context with silenceWavPath for audio clip operations
 */
export function clearClipAtDuplicateTarget(
  track: LiveAPI,
  sourceClipId: string,
  targetPosition: number,
  isMidiClip: boolean,
  context: TilingContext,
): void {
  if (!arrangementDuplicateCrashWorkaround) return;

  const sourceClip = LiveAPI.from(toLiveApiId(sourceClipId));

  if (sourceClip.getProperty("is_arrangement_clip") !== 1) return;

  const sourceStart = sourceClip.getProperty("start_time") as number;
  const sourceEnd = sourceClip.getProperty("end_time") as number;
  const targetEnd = targetPosition + (sourceEnd - sourceStart);

  // Iterate all arrangement clips and clear any that overlap the target range.
  // Arrangement clips on the same track never overlap each other, so a single
  // pass handles all overlapping clips without needing to re-fetch IDs.
  const clipIds = track.getChildIds("arrangement_clips");

  for (const clipId of clipIds) {
    const clip = LiveAPI.from(clipId);
    const clipStart = clip.getProperty("start_time") as number;
    const clipEnd = clip.getProperty("end_time") as number;

    if (clipStart < targetEnd && clipEnd > targetPosition) {
      clearOverlappingClip(
        track,
        clip,
        targetPosition,
        targetEnd,
        clipIds,
        isMidiClip,
        context,
      );
    }
  }
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
 * @returns The moved clip (LiveAPI instance)
 */
export function moveClipFromHolding(
  holdingClipId: string,
  track: LiveAPI,
  targetPosition: number,
  isMidiClip: boolean,
  context: TilingContext,
): LiveAPI {
  // Duplicate holding clip to target position
  clearClipAtDuplicateTarget(
    track,
    holdingClipId,
    targetPosition,
    isMidiClip,
    context,
  );
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
  let maxEnd = 0;

  for (const id of allClipIds) {
    const end = LiveAPI.from(id).getProperty("end_time") as number;

    if (end > maxEnd) maxEnd = end;
  }

  const holdingStart = maxEnd + 100;

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
