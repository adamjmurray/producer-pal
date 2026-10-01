// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";

/**
 * Which notes a transform touched, tracked by note object so the tally survives
 * note-count ops (ratchet/merge/split/repeat) and the write path's dedupe.
 */
export interface TransformOutcome {
  /** Touched notes, possibly including ones a note op later consumed */
  touched: Set<NoteEvent>;
  /** Touched notes the transform deleted itself (velocity/duration driven to 0) */
  deleted: number;
}

/**
 * Count the transformed notes of what actually gets written: touched notes that
 * are still in `written` (a note the dedupe collapsed away is gone), plus the
 * notes the transform itself deleted.
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

  let count = outcome.deleted;

  for (const note of written) {
    if (outcome.touched.has(note)) {
      count++;
    }
  }

  return count;
}
