// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { dedupeNotesKeepingLast } from "#src/notation/helpers/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { isChanged } from "./helpers/note-ops/transform-outcome.ts";

/**
 * What a transform did to the notes it selected, tracked by note object so the
 * tally survives note-count ops (ratchet/merge/split/repeat) and the write
 * path's dedupe. A note it selected but left exactly as it was is in neither.
 */
export interface TransformOutcome {
  /** Notes the transform changed or made, still in the clip */
  changed: Set<NoteEvent>;
  /** The notes the transform removed (driven to 0, or merged into another): their values in `original` */
  deleted: NoteEvent[];
  /** Each note the transform started with, as it started, by note */
  original: ReadonlyMap<NoteEvent, NoteEvent>;
  /** For each note an op made, the starting notes it came from */
  roots: ReadonlyMap<NoteEvent, ReadonlySet<NoteEvent>>;
  /** Every note the transform's selectors picked, plus any an op made */
  matched: ReadonlySet<NoteEvent>;
  /** False when every statement was skipped (audio-only parameters on a MIDI clip) */
  selected: boolean;
  /** True when a selection, expression or note op failed or was skipped */
  failed: boolean;
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
 * transforms), counting as if one pass ran them all. Each note is judged
 * against how it started before the first pass that saw it, and a note a pass
 * made against the starting notes it came from. So a note one pass changes and
 * a later one puts back counts as neither, and a note both changed counts once.
 * A starting note is deleted once a pass removes the last of its pieces.
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

  // The first pass to see a note holds how it started. A note a pass made has
  // no start of its own; it maps to the starting notes it came from.
  const original = new Map<NoteEvent, NoteEvent>();
  const roots = new Map<NoteEvent, ReadonlySet<NoteEvent>>();
  const gone = new Set<NoteEvent>();
  const touched = new Set<NoteEvent>();
  const matched = new Set<NoteEvent>();
  let selected = false;
  let failed = false;
  const rootsOf = (note: NoteEvent): ReadonlySet<NoteEvent> =>
    roots.get(note) ?? new Set([note]);

  for (const outcome of ran) {
    for (const [note, values] of outcome.original) {
      if (!original.has(note) && !roots.has(note)) {
        original.set(note, values);
      }
    }

    for (const root of removedRoots(outcome, rootsOf)) {
      gone.add(root);
    }

    // A pass's roots are notes it started with; map them through earlier passes.
    const madeNow = [...outcome.roots].map(
      ([note, from]) =>
        [
          note,
          new Set([...from].flatMap((parent) => [...rootsOf(parent)])),
        ] as const,
    );

    for (const [note, from] of madeNow) {
      roots.set(note, from);
    }

    for (const note of [...outcome.changed, ...outcome.roots.keys()]) {
      touched.add(note);
    }

    for (const note of outcome.matched) {
      matched.add(note);
    }

    selected ||= outcome.selected;
    failed ||= outcome.failed;
  }

  const changed = new Set<NoteEvent>();

  for (const note of touched) {
    if (isChanged(note, original, rootsOf(note))) {
      changed.add(note);
    }
  }

  const deleted = [...gone].map((note) => original.get(note) as NoteEvent);

  return { changed, deleted, original, roots, matched, selected, failed };
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

// --- Helpers below main exports ---

/**
 * The starting notes one pass removed the last piece of.
 * @param outcome - The pass
 * @param rootsOf - The starting notes a note the pass began with came from
 * @returns Those starting notes
 */
function removedRoots(
  outcome: TransformOutcome,
  rootsOf: (note: NoteEvent) => ReadonlySet<NoteEvent>,
): Set<NoteEvent> {
  // `deleted` holds the pass's own snapshots; map them back to its notes.
  const noteOf = new Map(
    [...outcome.original].map(([note, values]) => [values, note]),
  );
  const removed = new Set(
    outcome.deleted.map((values) => noteOf.get(values) as NoteEvent),
  );
  const kept = new Set<NoteEvent>();

  for (const note of outcome.original.keys()) {
    if (!removed.has(note)) {
      for (const root of rootsOf(note)) {
        kept.add(root);
      }
    }
  }

  const roots = new Set<NoteEvent>();

  for (const note of removed) {
    for (const root of rootsOf(note)) {
      if (!kept.has(root)) {
        roots.add(root);
      }
    }
  }

  return roots;
}
