// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { sortNotes } from "#src/notation/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  GRID_EPSILON,
  MAX_NOTE_PIECES,
  splitNoteAtCuts,
  splitNotes,
} from "./helpers/note-cut-helpers.ts";
import { evaluateExpression } from "./helpers/transform-evaluator-helpers.ts";
import { repeatNotes } from "./helpers/transform-repeat-helpers.ts";
import { noteInTimeRange } from "./helpers/transform-time-range-helpers.ts";
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
 * @param arrangementStart - Clip's arrangement origin in musical beats (used by
 *   a synced `split`), or undefined for session clips
 * @returns Indices (in the rebuilt list) of notes the op produced/affected,
 *   so the caller can report a meaningful "transformed" count
 */
export function applyNoteOp(
  op: NoteOp,
  notes: NoteEvent[],
  timeSigNumerator: number,
  timeSigDenominator: number,
  arrangementStart?: number,
): number[] {
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

  const produced =
    op.name === "split"
      ? splitNotes(matched, op, timeSigDenominator, arrangementStart)
      : op.name === "ratchet"
        ? ratchetNotes(matched, op, timeSigNumerator, timeSigDenominator)
        : op.name === "repeat"
          ? repeatNotes(matched, op, timeSigNumerator, timeSigDenominator)
          : mergeNotes(matched, op, timeSigNumerator, timeSigDenominator);

  // Rebuild in place: passthrough + produced, re-sorted (ratchet/merge can
  // reorder relative to passthrough notes). sortNotes keeps object identity.
  const rebuilt = sortNotes([...passthrough, ...produced]);

  notes.length = 0;
  notes.push(...rebuilt);

  // Report the indices of the op's output notes (distinct object refs) so the
  // caller's transformed count reflects how many notes the op produced.
  const producedSet = new Set(produced);
  const indices: number[] = [];

  for (let i = 0; i < notes.length; i++) {
    if (producedSet.has(notes[i] as NoteEvent)) {
      indices.push(i);
    }
  }

  return indices;
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
 *     grid line is left unchanged (with a warning).
 * Invalid args warn-and-skip (notes pass through unchanged), consistent with
 * update-tool error handling.
 * @param matched - Notes selected by the op
 * @param op - The ratchet operation
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The ratcheted note list (children replace each divided note)
 */
function ratchetNotes(
  matched: NoteEvent[],
  op: NoteOp,
  numerator: number,
  denominator: number,
): NoteEvent[] {
  // ratchet args are always expressions (bar|beat points only reach `split`).
  const arg = op.args[0] as ExpressionNode | undefined;

  if (op.args.length === 0 || arg == null) {
    console.warn(
      "ratchet() needs a count or note value, e.g. ratchet(2) or ratchet(n/16); skipping",
    );

    return matched;
  }

  if (op.args.length > 1) {
    console.warn(
      "ratchet() takes a single count or note value; using the first argument",
    );
  }

  const plan = resolveRatchetPlan(arg, numerator, denominator);

  if (plan == null) {
    return matched; // arg invalid — warn already emitted, pass through
  }

  const out: NoteEvent[] = [];
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

      out.push(...splitNoteAtCuts(note, cuts));
      continue;
    }

    let count = plan.count; // count form: always >= 2 (resolveRatchetPlan gate)

    if (count > MAX_NOTE_PIECES) {
      count = MAX_NOTE_PIECES;
      clamped++;
    }

    out.push(...splitNoteEqually(note, count));
  }

  if (shortNotes > 0) {
    console.warn(
      `ratchet: ${shortNotes} note(s) spanned no grid line and were left unchanged`,
    );
  }

  if (clamped > 0) {
    console.warn(
      `ratchet: ${clamped} note(s) clamped to the max of ${MAX_NOTE_PIECES} pieces`,
    );
  }

  return out;
}

/** Resolved ratchet plan: a fixed `count`, or a `grid` size in Ableton beats. */
interface RatchetPlan {
  count: number;
  grid: number | null;
}

/**
 * Resolve the ratchet argument to a plan. A note-value/bar-duration arg becomes
 * a per-note grid; any other expression becomes a fixed count. Returns null and
 * warns when the arg is unusable.
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
  const isGrid =
    typeof arg === "object" &&
    (arg.type === "nDuration" || arg.type === "barDuration");

  // A bare top-level pitch literal (`ratchet(C2)`) is nonsensical as a count and
  // would silently coerce to its MIDI number. Warn-and-skip it, mirroring the
  // audio evaluator's pitch-as-value guard. A pitch literal nested in arithmetic
  // is still resolved to a number below.
  if (typeof arg === "object" && arg.type === "pitchLiteral") {
    console.warn(
      `pitch name "${arg.name}" isn't a valid ratchet count; use a number like ratchet(2) or a note value like ratchet(n/16). Skipping ratchet(${arg.name}).`,
    );

    return null;
  }

  let value: number;

  try {
    // Args are constants (no per-note context). nDuration/barDuration evaluate
    // to musical beats; a count evaluates to a number.
    value = evaluateExpression(arg, 0, numerator, denominator, {
      start: 0,
      end: 0,
    });
  } catch (error) {
    console.warn(
      `ratchet() argument could not be evaluated (${errorMessage(error)}); skipping`,
    );

    return null;
  }

  if (!Number.isFinite(value)) {
    console.warn("ratchet() argument is not a number; skipping");

    return null;
  }

  if (isGrid) {
    const gridAbletonBeats = value * (4 / denominator); // musical -> Ableton

    if (gridAbletonBeats <= 0) {
      console.warn("ratchet() grid must be greater than 0; skipping");

      return null;
    }

    return { count: 0, grid: gridAbletonBeats };
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

// Message for an unusable merge() gap-tolerance argument (anything other than a
// note value or literal 0). Shown once, then the merge is skipped.
const MERGE_TOLERANCE_SKIP_MESSAGE =
  "merge() gap tolerance must be a note value like n/16, or 0 for touching notes (Nbar and other numbers are not accepted); skipping";

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
 * narrow). An unusable tolerance argument warns and the notes pass through
 * unchanged.
 * @param matched - Notes selected by the op
 * @param op - The merge operation (may carry a gap-tolerance argument)
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The merged notes (one per run within each pitch group)
 */
function mergeNotes(
  matched: NoteEvent[],
  op: NoteOp,
  numerator: number,
  denominator: number,
): NoteEvent[] {
  const tolerance = resolveMergeTolerance(op, numerator, denominator);

  if (tolerance == null) {
    return matched; // unusable tolerance — warn already emitted, pass through
  }

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

  for (const group of byPitch.values()) {
    out.push(...mergeRuns(group, tolerance));
  }

  return out;
}

/**
 * Resolve the optional merge gap-tolerance argument to an edge-to-edge gap in
 * Ableton beats: no arg spans all (Infinity), literal `0` merges only touching/
 * overlapping notes, and a note value becomes that many Ableton beats. Any other
 * argument (a non-zero bare number, `Nbar`, a pitch literal, an expression)
 * warns and returns null so the caller skips the merge.
 * @param op - The merge operation
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The gap tolerance in Ableton beats, or null to skip
 */
function resolveMergeTolerance(
  op: NoteOp,
  numerator: number,
  denominator: number,
): number | null {
  if (op.args.length === 0) {
    return Infinity; // no argument — span all (the default)
  }

  if (op.args.length > 1) {
    console.warn(
      "merge() takes a single gap tolerance; using the first argument",
    );
  }

  // merge args are always expressions (bar|beat points only reach `split`).
  const arg = op.args[0] as ExpressionNode;

  if (typeof arg === "number") {
    if (arg === 0) {
      return 0; // touching/overlapping notes only
    }

    console.warn(MERGE_TOLERANCE_SKIP_MESSAGE);

    return null;
  }

  if (typeof arg === "object" && arg.type === "nDuration") {
    // A note value is a pure constant — evaluates to musical beats, total.
    const musicalBeats = evaluateExpression(arg, 0, numerator, denominator, {
      start: 0,
      end: 0,
    });

    return musicalBeats * (4 / denominator); // musical -> Ableton beats
  }

  console.warn(MERGE_TOLERANCE_SKIP_MESSAGE);

  return null;
}

/**
 * Collapse one pitch group into runs separated by gaps larger than the
 * tolerance. Notes are taken in start-time order; each run carries its earliest
 * note's dynamics and spans to the latest offset reached before a gap exceeds
 * the tolerance.
 * @param group - Same-pitch notes (one merged group, non-empty)
 * @param tolerance - Max edge-to-edge gap (Ableton beats) that still merges;
 *   Infinity spans the whole group, 0 merges only touching/overlapping notes
 * @returns One sustained note per run
 */
function mergeRuns(group: NoteEvent[], tolerance: number): NoteEvent[] {
  const sorted = [...group].sort((a, b) => a.start_time - b.start_time);
  const out: NoteEvent[] = [];

  // group is non-empty by construction, so index 0 is always present.
  let runStart = sorted[0] as NoteEvent;
  let runEnd = runStart.start_time + runStart.duration;

  for (let i = 1; i < sorted.length; i++) {
    const note = sorted[i] as NoteEvent; // i < length, always present
    const gap = note.start_time - runEnd;

    if (gap <= tolerance) {
      const end = note.start_time + note.duration;

      if (end > runEnd) {
        runEnd = end; // extend the run to the later offset
      }
    } else {
      out.push({ ...runStart, duration: runEnd - runStart.start_time });
      runStart = note;
      runEnd = note.start_time + note.duration;
    }
  }

  out.push({ ...runStart, duration: runEnd - runStart.start_time });

  return out;
}
