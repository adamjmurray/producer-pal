// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  addCounts,
  type TransformCounts,
  type TransformOutcome,
} from "#src/notation/transform/transformed-count.ts";
import { transformsChangedNothingNote } from "#src/tools/clip/helpers/clip-entry-notes.ts";
import { type ClipReasons, noteClipReason } from "../entries/clip-reasons.ts";

/**
 * Hands a stage's transform results to the stage after it. duplicateLoop runs
 * preTransforms, doubles the clip, then runs the rest, and counts them as one:
 * whether anything changed can only be judged once the last stage has run.
 */
export interface StagedTransforms {
  /** True on the stage that hands over; it says nothing on the entry */
  defer: boolean;
  /** What the handing-over stage did, set by it */
  outcome?: TransformOutcome;
  /** What it counted, set by it */
  counts?: TransformCounts;
}

/**
 * Say on the clip's entry when transforms ran and changed nothing, judging the
 * stage together with any earlier one it was handed.
 * @param reasons - What each clip has to say beyond its result, added to
 * @param clipId - The clip's id
 * @param outcome - What this stage's transforms did, or undefined when none ran
 * @param counts - What this stage counted
 * @param staged - The hand-over between stages, when the call has several
 */
export function reportTransformsChangedNothing(
  reasons: ClipReasons,
  clipId: string,
  outcome: TransformOutcome | undefined,
  counts: TransformCounts,
  staged?: StagedTransforms,
): void {
  if (staged?.defer) {
    staged.outcome = outcome;
    staged.counts = counts;

    return;
  }

  const note = transformsChangedNothingNote(
    judgedOutcome(outcome, staged?.outcome),
    staged?.counts == null ? counts : addCounts(staged.counts, counts),
  );

  if (note != null) {
    noteClipReason(reasons, clipId, note);
  }
}

/**
 * The outcome to judge two stages by. Their notes are different objects (the
 * clip is read again after doubling), so a union would count a note twice; the
 * stage that matched more stands for both.
 * @param outcome - What this stage's transforms did, if any ran
 * @param earlier - What the earlier stage did, if it ran any
 * @returns The outcome to judge, or undefined when neither stage ran any
 */
function judgedOutcome(
  outcome: TransformOutcome | undefined,
  earlier: TransformOutcome | undefined,
): TransformOutcome | undefined {
  if (outcome == null || earlier == null) {
    return outcome ?? earlier;
  }

  const bigger =
    earlier.matched.size > outcome.matched.size ? earlier : outcome;

  return {
    ...bigger,
    selected: outcome.selected || earlier.selected,
    failed: outcome.failed || earlier.failed,
  };
}
