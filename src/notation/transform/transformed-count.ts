// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { dedupeNotesKeepingLast } from "#src/notation/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";

/**
 * Which notes a transform touched, tracked by note object so the tally survives
 * note-count ops (ratchet/merge/split/repeat) and the write path's dedupe.
 */
export interface TransformOutcome {
  /** Touched notes, possibly including ones a note op later consumed */
  touched: Set<NoteEvent>;
  /** Touched notes the transform deleted itself (velocity/duration driven to 0) */
  deleted: NoteEvent[];
}

/**
 * Union several outcomes (e.g. preTransforms then transforms) so a note touched
 * by more than one counts once.
 * @param outcomes - Outcomes to combine; undefined ones (no transform ran) are skipped
 * @returns The combined outcome, or undefined when none of them ran
 */
export function combineOutcomes(
  ...outcomes: (TransformOutcome | undefined)[]
): TransformOutcome | undefined {
  const ran = outcomes.filter((outcome) => outcome != null);

  if (ran.length === 0) {
    return undefined;
  }

  return {
    touched: new Set(ran.flatMap((outcome) => [...outcome.touched])),
    deleted: ran.flatMap((outcome) => outcome.deleted),
  };
}

/**
 * Count the transformed notes of what actually gets written: touched notes that
 * are still in `written` (a note the dedupe collapsed away is gone), plus the
 * notes the transform itself deleted. Deleted notes are collapsed by slot the
 * same way the write path does, so bar-copy duplicates count once.
 * @param outcome - What the transform touched, or undefined when none ran
 * @param written - The final notes, after any dedupe/merge that follows the transform
 * @returns The transformed count, or undefined when no transform ran
 */
export function countTransformed(
  outcome: TransformOutcome | undefined,
  written: readonly NoteEvent[],
): number | undefined {
  if (outcome == null) {
    return undefined;
  }

  let count = dedupeNotesKeepingLast(outcome.deleted).length;

  for (const note of written) {
    if (outcome.touched.has(note)) {
      count++;
    }
  }

  return count;
}
