// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { dedupeNotesKeepingLast } from "#src/notation/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { sameNoteValues } from "./helpers/note-ops/transform-outcome.ts";

/**
 * What a transform did to the notes it selected, tracked by note object so the
 * tally survives note-count ops (ratchet/merge/split/repeat) and the write
 * path's dedupe. A note it selected but left exactly as it was is in neither.
 */
export interface TransformOutcome {
  /** Notes the transform changed or made, still in the clip */
  changed: Set<NoteEvent>;
  /** The notes the transform removed (driven to 0, or merged into another), as they started */
  deleted: NoteEvent[];
  /** Each note the transform started with, as it started, by note */
  original: ReadonlyMap<NoteEvent, NoteEvent>;
}

/** What a result entry reports about a transform. */
export interface TransformCounts {
  /** Notes the transform changed that are still in the clip; 0 when it ran and changed none */
  transformed?: number;
  /** Notes the transform removed; left out when 0 */
  deletedNotes?: number;
}

/**
 * Join the outcomes of several passes over the same notes (preTransforms, then
 * transforms). A note counts as changed if it ended up different from how the
 * first pass found it, so a note one pass changes and a later one puts back
 * counts as neither, and a note both changed counts once.
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

  // The first pass to see a note holds how it started.
  const original = new Map<NoteEvent, NoteEvent>();

  for (const outcome of ran.toReversed()) {
    for (const [note, values] of outcome.original) {
      original.set(note, values);
    }
  }

  const changed = new Set<NoteEvent>();

  for (const note of ran.flatMap((outcome) => [...outcome.changed])) {
    const started = original.get(note);

    if (started == null || !sameNoteValues(note, started)) {
      changed.add(note);
    }
  }

  return {
    changed,
    deleted: ran.flatMap((outcome) => outcome.deleted),
    original,
  };
}

/**
 * Count what a transform changed and deleted in what actually gets written:
 * changed notes still in `written` (a note the dedupe collapsed away is gone),
 * and the notes the transform itself deleted. Deleted notes are collapsed by
 * slot the same way the write path does, so bar-copy duplicates count once.
 * @param outcome - What the transform did, or undefined when none ran
 * @param written - The final notes, after any dedupe/merge that follows the transform
 * @returns `transformed` (even at 0) once a transform ran, `deletedNotes` when
 *   above 0; an empty object when no transform ran
 */
export function countTransforms(
  outcome: TransformOutcome | undefined,
  written: readonly NoteEvent[],
): TransformCounts {
  if (outcome == null) {
    return {};
  }

  const deleted = dedupeNotesKeepingLast(outcome.deleted).length;
  let transformed = 0;

  for (const note of written) {
    if (outcome.changed.has(note)) {
      transformed++;
    }
  }

  return deleted > 0 ? { transformed, deletedNotes: deleted } : { transformed };
}

/**
 * Add the counts of two passes over the clip. Each pass compared its own
 * before and after, so a note changed in both counts in both.
 * @param first - Counts of the earlier pass
 * @param second - Counts of the later pass
 * @returns The summed counts; `transformed` is there when either pass ran a
 *   transform, `deletedNotes` only above 0
 */
export function addCounts(
  first: TransformCounts,
  second: TransformCounts,
): TransformCounts {
  const counts: TransformCounts = {};

  if (first.transformed != null || second.transformed != null) {
    counts.transformed = (first.transformed ?? 0) + (second.transformed ?? 0);
  }

  const deleted = (first.deletedNotes ?? 0) + (second.deletedNotes ?? 0);

  if (deleted > 0) {
    counts.deletedNotes = deleted;
  }

  return counts;
}
