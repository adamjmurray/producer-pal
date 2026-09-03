// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Optimization for multi-clip arrangement start moves.
 *
 * When multiple clips land on the same lane at the same position, later clips
 * overwrite earlier ones. This module determines which clips "survive"
 * (contribute to the final arrangement state) so non-survivors can be deleted
 * without the expensive duplicate+move operation.
 */

import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { moveGroupKey } from "./update-clip-move-groups.ts";

interface ClipMoveInfo {
  clipId: string;
  clipLength: number;
}

/** Where each clip in the call is headed. */
export interface ClipMoves {
  /** The position a clip is moving to, or null when the call named none. */
  startBeatsFor: (clip: LiveAPI) => number | null;
  /** The arrangement span a clip is being resized to, or null. */
  lengthBeatsFor: (clip: LiveAPI) => number | null;
  /** Where each clip is moving, from toPath, keyed by clip id. */
  destinationById?: Map<string, ClipPath>;
}

/**
 * Determine which clips will not survive when several are moved onto one lane
 * at one position. Walks backwards through each group in ID order, tracking
 * maximum length seen. A clip survives only if its length exceeds all clips
 * after it (because later clips placed at the same position overwrite earlier
 * ones up to their length).
 *
 * By construction, survivors in ID order are always in descending length:
 * the longest clip is first, each subsequent survivor is shorter and
 * "stacks on top" at the target position.
 *
 * Returns null when the optimization applies to nothing: no group has more
 * than one clip, or no group has a non-survivor.
 *
 * @param clips - Clips in the order they will be processed (ID order)
 * @param moves - Where each clip is headed
 * @returns Set of non-survivor clip IDs, or null if optimization doesn't apply
 */
export function computeNonSurvivorClipIds(
  clips: LiveAPI[],
  moves: ClipMoves,
): Set<string> | null {
  // Group by the lane the clips LAND on AND the position they land at. Clips
  // sharing a lane at different positions don't necessarily overwrite each
  // other, so they are separate groups and fall back to the normal
  // duplicate+move path. Grouping by lane alone would delete a clip that
  // nothing lands on top of.
  const groups = new Map<string, ClipMoveInfo[]>();

  for (const clip of clips) {
    const key = moveGroup(clip, moves);

    if (key == null) continue;

    const startTime = clip.getProperty("start_time") as number;
    const endTime = clip.getProperty("end_time") as number;

    const group = groups.get(key) ?? [];

    group.push({ clipId: clip.id, clipLength: endTime - startTime });
    groups.set(key, group);
  }

  // Backwards scan per group: a clip survives if its length > all after it
  const nonSurvivorIds = new Set<string>();

  for (const group of groups.values()) {
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
 * The group a clip lands in, or null when it doesn't take part.
 *
 * Skipped: a clip with no arrangementStart (it stays where it is, so nothing
 * about the call says it collides with anything) and one with an
 * arrangementLength (it tiles to fill the span, which this length comparison
 * doesn't model).
 * @param clip - Candidate clip
 * @param moves - Where each clip is headed
 * @returns The group key, or null to skip the clip
 */
function moveGroup(clip: LiveAPI, moves: ClipMoves): string | null {
  const startBeats = moves.startBeatsFor(clip);

  if (startBeats == null || moves.lengthBeatsFor(clip) != null) return null;

  const trackIndex = survivorTrack(clip, moves.destinationById?.get(clip.id));

  return trackIndex == null ? null : moveGroupKey(trackIndex, startBeats);
}

/**
 * The track a clip lands on, or null when it doesn't take part in the grouping.
 *
 * Skipped: session clips (they aren't moved via arrangement APIs), take-lane
 * SOURCES (the group key is track + position, which can't tell a take lane from
 * the main one, so a take-lane clip staying on its lane would wrongly mark a
 * main-lane clip below it a non-survivor), clips moving to a slot
 * (off the arrangement timeline entirely), clips moving ONTO a take lane
 * (re-created there one at a time, so the optimization has nothing to save),
 * and clips the destination won't take (wrong type, frozen), for the same
 * reason as take-lane sources: a clip that never lands overwrites nothing, so
 * counting it would delete a shorter sibling that the "survivor" then fails to
 * replace.
 * @param clip - Candidate clip
 * @param destination - Where the clip is moving, if the call named anywhere
 * @returns The destination track index, or null to skip the clip
 */
function survivorTrack(
  clip: LiveAPI,
  destination: ClipPath | undefined,
): number | null {
  if ((clip.getProperty("is_arrangement_clip") as number) <= 0) return null;
  if (isTakeLaneClip(clip)) return null;

  if (destination != null) {
    if (destination.kind !== "track") return null;

    const isMidiClip = (clip.getProperty("is_midi_clip") as number) > 0;

    return clipCopyBlocker(isMidiClip, destination.trackIndex) == null
      ? destination.trackIndex
      : null;
  }

  return clip.trackIndex;
}
