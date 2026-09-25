// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Clearing a clip a later clip in the call will land on top of, without betting
 * on that landing.
 *
 * The optimizer only predicts the overwrite, and a placement can refuse after
 * the prediction is made. So a marked clip is left alone until a survivor of
 * its group is confirmed landed, and cleared only then; when nothing lands it
 * stays where it was and its entry says so.
 *
 * Don't drop the id-0 guard because you can't reproduce it: nothing is known to
 * provoke it, and a frozen track — the usual suspect — takes the duplicate fine.
 */

import {
  buildClipResultObject,
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import {
  isTakeLaneClip,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import { arrangementLaneOf } from "#src/tools/shared/arrangement/helpers/arrangement-write-effects.ts";
import { emptyTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-placeholder.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { arrangementPositionPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { clipIsGone } from "../batch/buried-clips.ts";
import { appendReason } from "#src/tools/shared/helpers/entry-reasons.ts";
import { type OverwritePlan } from "./update-clip-arrangement-overwrite-plan.ts";
import {
  deferClipDeletion,
  type MoveGroup,
} from "./update-clip-move-groups.ts";

/** What a held-back clip says when a failed placement cleared it anyway. */
const CLEARED = "deleted: a move onto it failed after clearing its place";

interface DeferNonSurvivorArgs {
  clip: LiveAPI;
  /** The track the clip sits on, for the delete. */
  sourceTrack: LiveAPI;
  /** The track and lane it was headed for. */
  landing: ArrangementTrack;
  targetBeats: number;
  movedClipGroups: Map<string, MoveGroup>;
  updatedClips: ClipResult[];
  noteResult: NoteUpdateResult | null;
}

/**
 * Leave a clip where it is and note it down, instead of moving or clearing it.
 *
 * The entry goes into the response now so it keeps the clip's place in the
 * order the call named its targets; {@link flushDeferredDeletions} finishes it
 * once the group's fate is known.
 * @param args - Operation arguments
 * @param args.clip - The clip that is not being moved
 * @param args.sourceTrack - The track it sits on
 * @param args.landing - The track and lane it was headed for
 * @param args.targetBeats - The position it was headed for, in beats
 * @param args.movedClipGroups - Tally of clips landing on each lane and position
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for the entry
 */
export function deferNonSurvivorDeletion({
  clip,
  sourceTrack,
  landing,
  targetBeats,
  movedClipGroups,
  updatedClips,
  noteResult,
}: DeferNonSurvivorArgs): void {
  const result = buildClipResultObject(
    clip.id,
    noteResult,
    objectPathForApi(clip),
  );

  updatedClips.push(result);
  deferClipDeletion(movedClipGroups, landing, targetBeats, {
    clip,
    sourceTrack,
    result,
  });
}

/**
 * Settle every clip the call held back, once all its moves have run.
 *
 * A clip is cleared only when something long enough to bury it actually landed
 * on its group. A clip nothing landed on top of stays.
 * @param movedClipGroups - Tally of clips landing on each lane and position
 * @param plan - What the call was set to overwrite; absent when it planned none
 * @returns The entries of the clips left where they were, not moved
 */
export function flushDeferredDeletions(
  movedClipGroups: Map<string, MoveGroup>,
  plan: OverwritePlan | null | undefined,
): Set<ClipResult> {
  const unmoved = new Set<ClipResult>();

  for (const [key, group] of movedClipGroups) {
    if (group.deferred.length === 0) {
      continue;
    }

    const survivorLengths = plan?.survivorLengthsByGroup.get(key);

    for (const { clip, sourceTrack, result } of group.deferred) {
      if (
        !buriedByLanding(group, survivorLengths, plan?.lengthById.get(clip.id))
      ) {
        // Nothing landed on it — but the placement that failed still cleared
        // the target range first, which destroys a clip that already sat in it.
        // Report what is true now, not what was planned.
        if (clipIsGone(clip)) {
          result.deleted = true;
          appendReason(result, CLEARED);
        } else {
          appendReason(
            result,
            `not moved: the clip due to land on top of it at ${groupSpot(group)} didn't, so the original was kept`,
          );
          unmoved.add(result);
        }

        continue;
      }

      result.deleted = true;

      // The landing may already have cleared the range this clip sat in, in
      // which case there is nothing left to delete.
      if (!clipIsGone(clip)) {
        const leftover = removeMovedSource(clip, sourceTrack);

        if (leftover != null) {
          appendReason(result, leftover);
        }
      }
    }
  }

  return unmoved;
}

/**
 * Get the source out of the way once its copy has landed. Live can delete a
 * main-lane clip outright; a take-lane one can only be cleared in place, which
 * leaves a placeholder the user has to delete by hand.
 * @param clip - The source clip
 * @param sourceTrack - The track it sits on
 * @returns What a take lane kept, for the clip's entry to report, or null
 */
export function removeMovedSource(
  clip: LiveAPI,
  sourceTrack: LiveAPI,
): string | null {
  if (isTakeLaneClip(clip)) {
    return emptyTakeLaneClip(clip);
  }

  sourceTrack.call("delete_clip", toLiveApiId(clip.id));

  return null;
}

/**
 * Where a group's clips were headed, as a path.
 * @param group - The group
 * @param group.landing - The track and lane they were headed for
 * @param group.startBeats - The position they were headed for, in beats
 * @returns The path, e.g. "t0[17|1]" or "t0/l1[17|1]"
 */
function groupSpot({ landing, startBeats }: MoveGroup): string {
  return arrangementPositionPath(arrangementLaneOf(landing), startBeats);
}

/**
 * Whether something landed on this group that buries a held-back clip whole.
 *
 * Length is the whole question: a landing overwrites only up to its own length,
 * and a group's survivors are not all longer than its non-survivors. One
 * shorter than the held-back clip settles nothing, and so does an unknown one.
 * @param group - The group the clip was headed for
 * @param survivorLengths - The clips whose landing does the overwrite, by length
 * @param heldLength - Arrangement length of the held-back clip, in beats
 * @returns true when a landed clip covers the whole of it
 */
function buriedByLanding(
  group: MoveGroup,
  survivorLengths: Map<string, number> | undefined,
  heldLength: number | undefined,
): boolean {
  if (survivorLengths == null || heldLength == null) {
    return false;
  }

  for (const id of group.landed.keys()) {
    const landedLength = survivorLengths.get(id);

    if (landedLength != null && landedLength >= heldLength) {
      return true;
    }
  }

  return false;
}
