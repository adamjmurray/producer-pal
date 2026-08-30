// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Optimization for multi-clip arrangement start moves.
 *
 * When multiple clips on the same track are moved to the same position,
 * later clips overwrite earlier ones. This module determines which clips
 * "survive" (contribute to the final arrangement state) so non-survivors
 * can be deleted without the expensive duplicate+move operation.
 */

import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import {
  arrangementPath,
  type ClipPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";

interface ClipMoveInfo {
  clipId: string;
  clipLength: number;
}

/**
 * Determine which clips will not survive when multiple clips are moved to
 * the same arrangement position. Walks backwards through clips in ID order
 * per track, tracking maximum length seen. A clip survives only if its
 * length exceeds all clips after it (because later clips placed at the
 * same position overwrite earlier ones up to their length).
 *
 * By construction, survivors in ID order are always in descending length:
 * the longest clip is first, each subsequent survivor is shorter and
 * "stacks on top" at the target position.
 *
 * Returns null when optimization doesn't apply:
 * - No arrangementStart set
 * - arrangementLength also set (tiling interaction is complex)
 * - Only single clips per track (nothing to optimize)
 * - No non-survivors found (all clips contribute)
 *
 * @param clips - Clips in the order they will be processed (ID order)
 * @param arrangementStartBeats - Target position in beats
 * @param arrangementLengthBeats - Target length (must be null for optimization)
 * @param destinationById - Where each clip is moving, from toPath, keyed by clip id
 * @returns Set of non-survivor clip IDs, or null if optimization doesn't apply
 */
export function computeNonSurvivorClipIds(
  clips: LiveAPI[],
  arrangementStartBeats: number | null | undefined,
  arrangementLengthBeats: number | null | undefined,
  destinationById: Map<string, ClipPath> = new Map(),
): Set<string> | null {
  if (arrangementStartBeats == null || arrangementLengthBeats != null) {
    return null;
  }

  // Group by the lane the clips LAND on, not the one they start from. With
  // per-clip destinations those differ, and grouping by the source track would
  // delete a clip because a sibling heading somewhere else is longer.
  const laneClips = new Map<string, ClipMoveInfo[]>();

  for (const clip of clips) {
    const lane = survivorLane(clip, destinationById.get(clip.id));

    if (lane == null) continue;

    const startTime = clip.getProperty("start_time") as number;
    const endTime = clip.getProperty("end_time") as number;

    const group = laneClips.get(lane) ?? [];

    group.push({ clipId: clip.id, clipLength: endTime - startTime });
    laneClips.set(lane, group);
  }

  // Only optimize tracks with multiple clips
  let hasMultiClipTrack = false;

  for (const group of laneClips.values()) {
    if (group.length > 1) {
      hasMultiClipTrack = true;
      break;
    }
  }

  if (!hasMultiClipTrack) return null;

  // Backwards scan per track: a clip survives if its length > all after it
  const nonSurvivorIds = new Set<string>();

  for (const group of laneClips.values()) {
    if (group.length <= 1) continue;

    let maxLengthAfter = 0;

    for (let i = group.length - 1; i >= 0; i--) {
      // Loop bounds guarantee valid index
      const info = group[i] as ClipMoveInfo;

      if (info.clipLength > maxLengthAfter) {
        maxLengthAfter = info.clipLength;
      } else {
        nonSurvivorIds.add(info.clipId);
      }
    }
  }

  return nonSurvivorIds.size > 0 ? nonSurvivorIds : null;
}

/**
 * The lane a clip lands on, or null when it doesn't take part in the grouping.
 *
 * Skipped: session clips (they aren't moved via arrangement APIs), take-lane
 * SOURCES (`duplicate_clip_to_arrangement` is Track-only, so they're
 * warned-and-skipped downstream — including one would let a long take-lane clip
 * wrongly mark a shorter main-lane clip a non-survivor), clips moving to a slot
 * (off the arrangement timeline entirely), clips moving ONTO a take lane
 * (re-created there one at a time, so the optimization has nothing to save),
 * and clips the destination won't take (wrong type, frozen), for the same
 * reason as take-lane sources: a clip that never lands overwrites nothing, so
 * counting it would delete a shorter sibling that the "survivor" then fails to
 * replace.
 * @param clip - Candidate clip
 * @param destination - Where the clip is moving, if the call named anywhere
 * @returns The destination lane's path, or null to skip the clip
 */
function survivorLane(
  clip: LiveAPI,
  destination: ClipPath | undefined,
): string | null {
  if ((clip.getProperty("is_arrangement_clip") as number) <= 0) return null;
  if (isTakeLaneClip(clip)) return null;

  if (destination != null) {
    if (destination.kind !== "track") return null;

    const isMidiClip = (clip.getProperty("is_midi_clip") as number) > 0;

    return clipCopyBlocker(isMidiClip, destination.trackIndex) == null
      ? arrangementPath(destination.trackIndex)
      : null;
  }

  const trackIndex = clip.trackIndex;

  return trackIndex == null ? null : arrangementPath(trackIndex);
}
