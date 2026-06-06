// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { sortNotes } from "#src/notation/note-sort.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { evaluateExpression } from "./helpers/transform-evaluator-helpers.ts";
import { noteInTimeRange } from "./helpers/transform-time-range-helpers.ts";
import { type ExpressionNode, type NoteOp } from "./parser/transform-parser.ts";

// Per-note ceiling on ratchet pieces — bounds note explosion. A roll of more
// than this is well past any musical use; counts above it are clamped + warned.
const MAX_RATCHET_COUNT = 64;

/**
 * Apply a note-count operation (ratchet/merge) to the note list IN PLACE.
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
 * @returns Indices (in the rebuilt list) of notes the op produced/affected,
 *   so the caller can report a meaningful "transformed" count
 */
export function applyNoteOp(
  op: NoteOp,
  notes: NoteEvent[],
  timeSigNumerator: number,
  timeSigDenominator: number,
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
    op.name === "ratchet"
      ? ratchetNotes(matched, op, timeSigNumerator, timeSigDenominator)
      : mergeNotes(matched);

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
 * Ratchet matched notes: divide each into equal pieces (a roll). The argument is
 * either a count (`ratchet(4)` → 4 equal pieces) or a note value (`ratchet(n/16)`
 * → as many 16th-note pieces as fit). Invalid args warn-and-skip (notes pass
 * through unchanged), consistent with update-tool error handling.
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
  const arg = op.args[0];

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

    let count = plan.grid ? Math.round(note.duration / plan.grid) : plan.count;

    if (count < 2) {
      out.push(note); // grid coarser than the note (or count 1) — leave as-is
      if (plan.grid) shortNotes++;
      continue;
    }

    if (count > MAX_RATCHET_COUNT) {
      count = MAX_RATCHET_COUNT;
      clamped++;
    }

    out.push(...splitNoteEqually(note, count));
  }

  if (shortNotes > 0) {
    console.warn(
      `ratchet: ${shortNotes} note(s) shorter than the grid were left unchanged`,
    );
  }

  if (clamped > 0) {
    console.warn(
      `ratchet: ${clamped} note(s) clamped to the max of ${MAX_RATCHET_COUNT} pieces`,
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
 * Merge matched notes: collapse all same-pitch notes into one spanning note from
 * the earliest onset to the latest offset. Dynamics (velocity/probability/
 * deviation) come from the earliest note in each pitch group. Notes of different
 * pitches are left independent (scope by pitch/time selector to narrow).
 * @param matched - Notes selected by the op
 * @returns One spanning note per distinct pitch present in the selection
 */
function mergeNotes(matched: NoteEvent[]): NoteEvent[] {
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
    let earliest: NoteEvent | undefined;
    let maxEnd = -Infinity;

    for (const note of group) {
      if (earliest == null || note.start_time < earliest.start_time) {
        earliest = note;
      }

      const end = note.start_time + note.duration;

      if (end > maxEnd) {
        maxEnd = end;
      }
    }

    // The group is non-empty by construction, so earliest is always set.
    const base = earliest as NoteEvent;

    out.push({ ...base, duration: maxEnd - base.start_time });
  }

  return out;
}
