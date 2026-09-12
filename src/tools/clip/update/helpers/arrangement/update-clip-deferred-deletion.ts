// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Clearing a clip a later clip in the call will land on top of, without
 * betting on that landing.
 *
 * The move optimization can only predict the overwrite, and a placement can
 * refuse after the prediction is made. So a clip it marks is left alone until a
 * survivor of its group is confirmed to have landed, and it is only then
 * cleared. When nothing lands, the clip stays where it was and its entry says
 * so.
 *
 * Waiting for the landing, rather than predicting every refusal, is what makes
 * this safe without knowing the full list. The duplicate answering with id 0 is
 * guarded for on that basis: nothing is known to provoke it — a frozen track,
 * the usual suspect, takes the duplicate fine — so don't drop the guard on the
 * grounds that you can't reproduce it.
 */

import {
  buildClipResultObject,
  type ClipResult,
  type NoteUpdateResult,
} from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { isTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { emptyTakeLaneClip } from "#src/tools/shared/arrangement/helpers/take-lane-placeholder.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type OverwritePlan } from "./update-clip-arrangement-optimizer.ts";
import {
  deferClipDeletion,
  type MoveGroup,
} from "./update-clip-move-groups.ts";

interface DeferNonSurvivorArgs {
  clip: LiveAPI;
  /** The track the clip sits on, for the delete. */
  sourceTrack: LiveAPI;
  destTrackIndex: number;
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
 * @param args.destTrackIndex - The track it was headed for
 * @param args.targetBeats - The position it was headed for, in beats
 * @param args.movedClipGroups - Tally of clips landing on each track and position
 * @param args.updatedClips - Array to collect results
 * @param args.noteResult - Note update result for the entry
 */
export function deferNonSurvivorDeletion({
  clip,
  sourceTrack,
  destTrackIndex,
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
  deferClipDeletion(movedClipGroups, destTrackIndex, targetBeats, {
    clip,
    sourceTrack,
    result,
  });
}

/**
 * Settle every clip the call held back, once all its moves have run.
 *
 * A clip is cleared only when something long enough to bury it actually landed
 * on its group — then it is counted too, since the count is what the "same
 * position" warning says out loud. A clip nothing landed on top of stays.
 * @param movedClipGroups - Tally of clips landing on each track and position
 * @param plan - What the call was set to overwrite; absent when it planned none
 */
export function flushDeferredDeletions(
  movedClipGroups: Map<string, MoveGroup>,
  plan: OverwritePlan | null | undefined,
): void {
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
        result.deleted = !clip.exists();

        continue;
      }

      result.deleted = true;
      group.count++;

      // The landing may already have cleared the range this clip sat in, in
      // which case there is nothing left to delete.
      if (clip.exists()) {
        removeMovedSource(clip, sourceTrack);
      }
    }
  }
}

/**
 * Get the source out of the way once its copy has landed. Live can delete a
 * main-lane clip outright; a take-lane one can only be cleared in place, which
 * leaves a placeholder the user has to delete by hand.
 * @param clip - The source clip
 * @param sourceTrack - The track it sits on
 */
export function removeMovedSource(clip: LiveAPI, sourceTrack: LiveAPI): void {
  if (isTakeLaneClip(clip)) {
    emptyTakeLaneClip(clip);
  } else {
    sourceTrack.call("delete_clip", toLiveApiId(clip.id));
  }
}

/**
 * Whether something landed on this group that buries a held-back clip whole.
 *
 * Length is the whole question: clips landing at one position overwrite only up
 * to their own length, and a group's survivors are not all longer than its
 * non-survivors. A landing shorter than the held-back clip leaves part of it
 * standing, so it settles nothing. An unknown length never clears anything.
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

  for (const id of group.landed) {
    const landedLength = survivorLengths.get(id);

    if (landedLength != null && landedLength >= heldLength) {
      return true;
    }
  }

  return false;
}
