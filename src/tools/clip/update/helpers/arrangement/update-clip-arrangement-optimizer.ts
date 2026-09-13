// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Optimization for multi-clip arrangement start moves.
 *
 * When multiple clips land on the same lane at the same position, later clips
 * overwrite earlier ones. This module works out which clips "survive"
 * (contribute to the final arrangement state) so the rest can be deleted
 * instead of paying for a duplicate+move nothing keeps.
 *
 * The plan is a prediction, so it never authorizes a deletion by itself: it
 * also names the clips whose landing would perform each overwrite, and the
 * deletion waits until one of them really lands.
 */

import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { clipCopyBlocker } from "#src/tools/shared/clip/copy-clip-to-slot.ts";
import { type ClipPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { moveGroupKey } from "./update-clip-move-groups.ts";

interface ClipMoveInfo {
  clipId: string;
  clipLength: number;
}

/** What a call's moves are set to land on top of, if they land at all. */
export interface OverwritePlan {
  /** Clips a later clip in the same group is set to land on top of. */
  nonSurvivorIds: Set<string>;
  /**
   * Per group key ({@link moveGroupKey}), the clips whose landing performs that
   * overwrite, each with the length it covers. A landing only settles a
   * held-back clip it is long enough to bury.
   */
  survivorLengthsByGroup: Map<string, Map<string, number>>;
  /** Arrangement length in beats of every clip the plan weighed, by id. */
  lengthById: Map<string, number>;
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
 * Work out which clips will not survive when several are moved onto one lane at
 * one position. Walks backwards through each group in ID order, tracking
 * maximum length seen. A clip survives only if its length exceeds all clips
 * after it (because later clips placed at the same position overwrite earlier
 * ones up to their length).
 *
 * Survivors in ID order are always in descending length: the longest clip is
 * first, each subsequent survivor is shorter and "stacks on top" at the target
 * position. That does NOT make every survivor longer than every non-survivor —
 * lengths [20, 40, 12] leave the 20 a non-survivor while the trailing 12
 * survives — so the plan carries each survivor's length and the deferred
 * deletion compares before it clears anything.
 *
 * Returns null when the optimization applies to nothing: no group has more
 * than one clip, or no group has a non-survivor.
 *
 * @param clips - Clips in the order they will be processed (ID order)
 * @param moves - Where each clip is headed
 * @returns The overwrite plan, or null when it applies to nothing
 */
export function computeOverwritePlan(
  clips: LiveAPI[],
  moves: ClipMoves,
): OverwritePlan | null {
  // Group by the lane the clips LAND on AND the position they land at. Clips
  // sharing a lane at different positions don't necessarily overwrite each
  // other, so they are separate groups and fall back to the normal
  // duplicate+move path. Grouping by lane alone would delete a clip that
  // nothing lands on top of.
  const groups = new Map<string, ClipMoveInfo[]>();

  for (const clip of clips) {
    const key = moveGroup(clip, moves);

    if (key == null) {
      continue;
    }

    const startTime = clip.getProperty("start_time") as number;
    const endTime = clip.getProperty("end_time") as number;

    const group = groups.get(key) ?? [];

    group.push({ clipId: clip.id, clipLength: endTime - startTime });
    groups.set(key, group);
  }

  const nonSurvivorIds = new Set<string>();
  const survivorLengthsByGroup = new Map<string, Map<string, number>>();
  const lengthById = new Map<string, number>();

  for (const [key, group] of groups) {
    if (group.length <= 1) {
      continue;
    }

    const { survivors, nonSurvivors } = splitGroup(group);

    if (nonSurvivors.size === 0) {
      continue;
    }

    for (const id of nonSurvivors) {
      nonSurvivorIds.add(id);
    }

    for (const { clipId, clipLength } of group) {
      lengthById.set(clipId, clipLength);
    }

    survivorLengthsByGroup.set(
      key,
      new Map(
        group
          .filter(({ clipId }) => survivors.has(clipId))
          .map(({ clipId, clipLength }) => [clipId, clipLength]),
      ),
    );
  }

  return nonSurvivorIds.size > 0
    ? { nonSurvivorIds, survivorLengthsByGroup, lengthById }
    : null;
}

/**
 * Backwards scan of one group: a clip survives if its length beats every clip
 * after it, and is overwritten otherwise.
 * @param group - The group's clips, in ID order
 * @returns The group's survivors and the clips they overwrite
 */
function splitGroup(group: ClipMoveInfo[]): {
  survivors: Set<string>;
  nonSurvivors: Set<string>;
} {
  const survivors = new Set<string>();
  const nonSurvivors = new Set<string>();
  let maxLengthAfter = 0;

  for (let i = group.length - 1; i >= 0; i--) {
    // Loop bounds guarantee valid index
    const info = group[i] as ClipMoveInfo;

    if (info.clipLength > maxLengthAfter) {
      maxLengthAfter = info.clipLength;
      survivors.add(info.clipId);
    } else {
      nonSurvivors.add(info.clipId);
    }
  }

  return { survivors, nonSurvivors };
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

  if (startBeats == null || moves.lengthBeatsFor(clip) != null) {
    return null;
  }

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
 * and clips the destination won't take (wrong type, frozen) — a clip that never
 * lands overwrites nothing, so counting it only holds a sibling back for a
 * landing that never comes.
 * @param clip - Candidate clip
 * @param destination - Where the clip is moving, if the call named anywhere
 * @returns The destination track index, or null to skip the clip
 */
function survivorTrack(
  clip: LiveAPI,
  destination: ClipPath | undefined,
): number | null {
  if ((clip.getProperty("is_arrangement_clip") as number) <= 0) {
    return null;
  }

  if (isTakeLaneClip(clip)) {
    return null;
  }

  if (destination != null) {
    if (destination.kind !== "track") {
      return null;
    }

    const isMidiClip = (clip.getProperty("is_midi_clip") as number) > 0;

    return clipCopyBlocker(isMidiClip, destination.trackIndex) == null
      ? destination.trackIndex
      : null;
  }

  return clip.trackIndex;
}
