// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { sortNotes } from "#src/notation/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "./transform-warning-label.ts";
import {
  GRID_EPSILON,
  MAX_NOTE_PIECES,
  splitNoteAtCuts,
  splitNotes,
} from "./helpers/note-ops/note-cuts.ts";
import {
  madeFrom,
  type NoteOpResult,
  type NoteParents,
  skippedNoteOp,
} from "./helpers/note-ops/note-op-result.ts";
import {
  isDurationNode,
  numericOpArg,
} from "./helpers/note-ops/numeric-op-arg.ts";
import { repeatNotes } from "./helpers/note-ops/repeat-notes.ts";
import { noteInTimeRange } from "./helpers/time-range-bounds.ts";
import {
  constantEvalContext,
  evaluateExpression,
} from "./helpers/transform-evaluation.ts";
import { type ExpressionNode, type NoteOp } from "./parser/transform-parser.ts";

/**
 * Apply a note-count operation (ratchet/repeat/split/merge) to the note list IN
 * PLACE.
 *
 * Notes outside the op's selector pass through unchanged; matched notes are
 * replaced by the op's output and the whole list is re-sorted. The caller holds
 * this same array reference, so the array is mutated (length reset + repush)
 * rather than replaced.
 *
 * @param op - The note-count operation (with optional pitch/time selector)
 * @param notes - Notes to operate on (mutated in place)
 * @param timeSigNumerator - Time signature numerator (musical beats per bar)
 * @param timeSigDenominator - Time signature denominator
 * @param arrangementOrigin - Arrangement position of note time 0, in musical beats (used by
 *   a synced `split`), or undefined for session clips
 * @returns The op's output for the matched notes (kept originals included) and
 *   where the notes it made came from; both empty when the op was skipped
 */
export function applyNoteOp(
  op: NoteOp,
  notes: NoteEvent[],
  timeSigNumerator: number,
  timeSigDenominator: number,
  arrangementOrigin?: number,
): Pick<NoteOpResult, "notes" | "parents"> {
  const beatScale = timeSigDenominator / 4; // Ableton beats -> musical beats

  // Partition by the op's selector (pitch range + time range).
  const matched: NoteEvent[] = [];
  const passthrough: NoteEvent[] = [];

  for (const note of notes) {
    if (noteMatchesSelector(note, op, timeSigNumerator, beatScale)) {
      matched.push(note);
    } else {
      passthrough.push(note);
    }
  }

  const result =
    op.name === "split"
      ? splitNotes(matched, op, timeSigDenominator, arrangementOrigin)
      : op.name === "ratchet"
        ? ratchetNotes(matched, op, timeSigNumerator, timeSigDenominator)
        : op.name === "repeat"
          ? repeatNotes(matched, op, timeSigNumerator, timeSigDenominator)
          : mergeNotes(matched, op, timeSigNumerator, timeSigDenominator);

  // Rebuild in place: passthrough + produced, re-sorted (a note-count op's
  // output can reorder relative to passthrough notes). sortNotes keeps identity.
  const rebuilt = sortNotes([...passthrough, ...result.notes]);

  notes.length = 0;
  notes.push(...rebuilt);

  return result.skipped
    ? { notes: [], parents: new Map() }
    : { notes: result.notes, parents: result.parents };
}

/**
 * Test whether a note falls within an op's selector (pitch range + time range).
 * @param note - Note to test
 * @param op - Note-count operation carrying the selector
 * @param numerator - Time signature numerator (musical beats per bar)
 * @param beatScale - Ableton-to-musical beat scale (denominator / 4)
 * @returns True if the note matches (or the op has no selector)
 */
function noteMatchesSelector(
  note: NoteEvent,
  op: NoteOp,
  numerator: number,
  beatScale: number,
): boolean {
  if (
    op.pitchRange != null &&
    (note.pitch < op.pitchRange.startPitch ||
      note.pitch > op.pitchRange.endPitch)
  ) {
    return false;
  }

  if (
    op.timeRange != null &&
    !noteInTimeRange(note.start_time * beatScale, op.timeRange, numerator)
  ) {
    return false;
  }

  return true;
}

/**
 * Ratchet matched notes (a roll). Two argument forms with distinct geometry:
 *   - count (`ratchet(4)`) → 4 EQUAL end-to-end pieces, regardless of position.
 *   - note value (`ratchet(n/16)`) → cut on the ABSOLUTE 16th-note grid, so the
 *     pieces line up with bar positions. The first/last piece can be a partial
 *     sliver when the note doesn't start/end on a grid line; a note that spans no
 *     grid line is left unchanged (with a detail).
 * checkTransformArgs has already refused a bad argument it can judge up front;
 * one it couldn't (it uses a variable or a random function) that turns out
 * unusable warns and the notes pass through unchanged.
 * @param matched - Notes selected by the op
 * @param op - The ratchet operation
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The ratcheted note list (children replace each divided note), or a
 *   skipped result
 */
function ratchetNotes(
  matched: NoteEvent[],
  op: NoteOp,
  numerator: number,
  denominator: number,
): NoteOpResult {
  // ratchet args are always expressions (bar|beat points only reach `split`).
  const arg = op.args[0] as ExpressionNode;

  const plan = resolveRatchetPlan(arg, numerator, denominator);

  if (plan == null) {
    return skippedNoteOp(matched); // arg invalid — warn already emitted, pass through
  }

  const out: NoteEvent[] = [];
  const parents: NoteParents = new Map();
  let shortNotes = 0;
  let clamped = 0;

  for (const note of matched) {
    if (note.duration <= 0) {
      out.push(note); // nothing to divide
      continue;
    }

    if (plan.grid != null) {
      const cuts = gridCutsWithin(
        note.start_time,
        note.start_time + note.duration,
        plan.grid,
      );

      if (cuts.length === 0) {
        out.push(note); // note spans no grid line — leave as-is
        shortNotes++;
        continue;
      }

      if (cuts.length + 1 > MAX_NOTE_PIECES) {
        cuts.length = MAX_NOTE_PIECES - 1; // keep pieces <= the cap
        clamped++;
      }

      out.push(...madeFrom(parents, note, splitNoteAtCuts(note, cuts)));
      continue;
    }

    let count = plan.count; // count form: always >= 2 (resolveRatchetPlan gate)

    if (count > MAX_NOTE_PIECES) {
      count = MAX_NOTE_PIECES;
      clamped++;
    }

    out.push(...madeFrom(parents, note, splitNoteEqually(note, count)));
  }

  if (shortNotes > 0) {
    console.clipDetail(
      `ratchet: ${shortNotes} note(s) spanned no grid line, left unchanged`,
    );
  }

  if (clamped > 0) {
    console.clipDetail(
      `ratchet: ${clamped} note(s) clamped to the max of ${MAX_NOTE_PIECES} pieces`,
    );
  }

  return { notes: out, skipped: false, parents };
}

/** Resolved ratchet plan: a fixed `count`, or a `grid` size in Ableton beats. */
interface RatchetPlan {
  count: number;
  grid: number | null;
}

/**
 * Resolve the ratchet argument to a plan. A note-value/bar-duration arg becomes
 * a per-note grid; any other expression becomes a fixed count. Returns null and
 * warns when a count the up-front checks couldn't judge is unusable.
 * @param arg - The (already-parsed) ratchet argument node
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns A ratchet plan, or null to skip
 */
function resolveRatchetPlan(
  arg: ExpressionNode,
  numerator: number,
  denominator: number,
): RatchetPlan | null {
  const isGrid = isDurationNode(arg);

  const value = numericOpArg(arg, numerator, denominator, "ratchet() argument");

  if (value == null) {
    return null;
  }

  if (isGrid) {
    // A note value / bar duration is always a constant, already checked above 0.
    return { count: 0, grid: value * (4 / denominator) }; // musical -> Ableton
  }

  const count = Math.round(value);

  if (count < 2) {
    console.warn(`ratchet(${value}) needs a count of 2 or more; skipping`);

    return null;
  }

  return { count, grid: null };
}

/**
 * Split one note into `count` equal end-to-end pieces, each inheriting the
 * parent's pitch/velocity/probability/deviation.
 * @param note - Note to divide
 * @param count - Number of equal pieces (>= 2)
 * @returns The child notes, in time order
 */
function splitNoteEqually(note: NoteEvent, count: number): NoteEvent[] {
  const childDuration = note.duration / count;
  const children: NoteEvent[] = [];

  for (let k = 0; k < count; k++) {
    children.push({
      ...note,
      start_time: note.start_time + k * childDuration,
      duration: childDuration,
    });
  }

  return children;
}

/**
 * Absolute grid-line positions strictly inside the open interval (start, end).
 * Lines are multiples of `grid` measured from 0 (the clip's bar|beat origin), so
 * the cuts align a note's pieces to bar positions. A note that starts and/or ends
 * exactly on a grid line keeps that boundary as its own onset/offset (it is not a
 * cut), so a grid-aligned note of exactly one grid cell yields no cuts.
 * @param start - Note onset in the same beat unit as `grid`
 * @param end - Note offset in the same beat unit as `grid`
 * @param grid - Grid spacing (> 0)
 * @returns The interior grid-line positions, ascending
 */
function gridCutsWithin(start: number, end: number, grid: number): number[] {
  const cuts: number[] = [];
  let line = Math.ceil((start + GRID_EPSILON) / grid) * grid;

  while (line < end - GRID_EPSILON) {
    cuts.push(line);
    line += grid;
  }

  return cuts;
}

/**
 * Merge matched notes: collapse same-pitch notes into sustained notes. The
 * optional gap tolerance sets how far apart (edge to edge) two same-pitch notes
 * may sit and still merge:
 *   - `merge()` → span ALL same-pitch matched notes into one note (the default)
 *   - `merge(0)` → glue only touching/overlapping notes (gap <= 0)
 *   - `merge(n/X)` → glue notes within that note-value gap; a larger gap starts
 *     a new run
 * Within each merged run, dynamics (velocity/probability/deviation) come from
 * its earliest note. Different pitches stay independent (scope by selector to
 * narrow).
 * @param matched - Notes selected by the op
 * @param op - The merge operation (may carry a gap-tolerance argument)
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The merged notes (one per run within each pitch group), or a
 *   skipped result
 */
function mergeNotes(
  matched: NoteEvent[],
  op: NoteOp,
  numerator: number,
  denominator: number,
): NoteOpResult {
  const tolerance = resolveMergeTolerance(op, numerator, denominator);

  const byPitch = new Map<number, NoteEvent[]>();

  for (const note of matched) {
    const group = byPitch.get(note.pitch);

    if (group) {
      group.push(note);
    } else {
      byPitch.set(note.pitch, [note]);
    }
  }

  const out: NoteEvent[] = [];
  const parents: NoteParents = new Map();

  for (const group of byPitch.values()) {
    out.push(...mergeRuns(group, tolerance, parents));
  }

  return { notes: out, skipped: false, parents };
}

/**
 * Resolve the optional merge gap-tolerance argument to an edge-to-edge gap in
 * Ableton beats: no arg spans all (Infinity), a note value becomes that many
 * Ableton beats, and the only other argument checkTransformArgs lets through,
 * literal `0`, merges only touching/overlapping notes.
 * @param op - The merge operation
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The gap tolerance in Ableton beats
 */
function resolveMergeTolerance(
  op: NoteOp,
  numerator: number,
  denominator: number,
): number {
  if (op.args.length === 0) {
    return Infinity; // no argument — span all (the default)
  }

  // merge args are always expressions (bar|beat points only reach `split`).
  const arg = op.args[0] as ExpressionNode;

  if (typeof arg === "number") {
    return 0; // touching/overlapping notes only
  }

  // A note value is a pure constant — evaluates to musical beats, total.
  const musicalBeats = evaluateExpression(
    arg,
    constantEvalContext(numerator, denominator),
  );

  return musicalBeats * (4 / denominator); // musical -> Ableton beats
}

/**
 * Collapse one pitch group into runs separated by gaps larger than the
 * tolerance. Notes are taken in start-time order; each run carries its earliest
 * note's dynamics and spans to the latest offset reached before a gap exceeds
 * the tolerance.
 * @param group - Same-pitch notes (one merged group, non-empty)
 * @param tolerance - Max edge-to-edge gap (Ableton beats) that still merges;
 *   Infinity spans the whole group, 0 merges only touching/overlapping notes
 * @param parents - Records which notes each merged note came from
 * @returns One sustained note per run
 */
function mergeRuns(
  group: NoteEvent[],
  tolerance: number,
  parents: NoteParents,
): NoteEvent[] {
  const sorted = group.toSorted((a, b) => a.start_time - b.start_time);
  const out: NoteEvent[] = [];

  // group is non-empty by construction, so index 0 is always present.
  const first = sorted[0] as NoteEvent;
  let run = [first];
  let runEnd = first.start_time + first.duration;

  for (let i = 1; i < sorted.length; i++) {
    const note = sorted[i] as NoteEvent; // i < length, always present
    const gap = note.start_time - runEnd;

    if (gap <= tolerance) {
      runEnd = Math.max(runEnd, note.start_time + note.duration); // extend the run
      run.push(note);
    } else {
      out.push(finishRun(run, runEnd, parents));
      run = [note];
      runEnd = note.start_time + note.duration;
    }
  }

  out.push(finishRun(run, runEnd, parents));

  return out;
}

/**
 * The note a merge run becomes. A run of one is the note itself, so a lone
 * note a merge leaves alone isn't counted as changed.
 * @param run - The run's notes, earliest first
 * @param runEnd - Where the run ends
 * @param parents - Records which notes the merged note came from
 * @returns The merged note
 */
function finishRun(
  run: NoteEvent[],
  runEnd: number,
  parents: NoteParents,
): NoteEvent {
  const first = run[0] as NoteEvent;

  if (run.length === 1) {
    return first;
  }

  const [merged] = madeFrom(parents, run, [
    { ...first, duration: runEnd - first.start_time },
  ]);

  return merged as NoteEvent;
}
