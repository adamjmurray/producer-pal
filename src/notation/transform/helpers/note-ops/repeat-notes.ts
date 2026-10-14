// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "../../transform-warning-label.ts";
import {
  type ExpressionNode,
  type NoteOp,
} from "../../parser/transform-parser.ts";
import {
  constantEvalContext,
  evaluateExpression,
} from "../transform-evaluation.ts";
import { MAX_NOTE_PIECES } from "./note-cuts.ts";
import {
  madeFrom,
  type NoteOpResult,
  type NoteParents,
  skippedNoteOp,
} from "./note-op-result.ts";
import { numericOpArg } from "./numeric-op-arg.ts";

/**
 * Repeat (echo) matched notes: keep the originals and emit `copies` time-shifted
 * copies of each, the k-th copy displaced by `k * offset`.
 *
 * Unlike duplicateLoop this does NOT resize the clip — copies landing past the
 * clip's end are still emitted (hidden in Live until the clip is lengthened),
 * consistent with transforms never changing clip length.
 *   - repeat(n/8)     → original + 1 echo an eighth note later
 *   - repeat(n/8, 2)  → original + 2 copies at +1 and +2 eighth notes
 *   - repeat(1bar, 3) → original + 3 copies, each a further bar on
 * `offset` (first arg) is a note value (n/X) or bar duration (<count>bar),
 * greater than 0. `copies` (second arg, optional, default 1) is the number of
 * echoes (>= 1, clamped to MAX_NOTE_PIECES). checkTransformArgs has already
 * refused a wrong offset or a count it can judge up front; a count it couldn't
 * (it uses a variable or a random function) that turns out unusable warns and
 * the notes pass through unchanged.
 * @param matched - Notes selected by the op
 * @param op - The repeat operation (args: offset duration, optional copy count)
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The originals plus their time-shifted copies, or a skipped result
 */
export function repeatNotes(
  matched: NoteEvent[],
  op: NoteOp,
  numerator: number,
  denominator: number,
): NoteOpResult {
  // repeat args are always expressions (bar|beat points only reach `split`).
  const offsetArg = op.args[0] as ExpressionNode;
  const copiesArg = op.args[1] as ExpressionNode | undefined;
  const offset = repeatOffset(offsetArg, numerator, denominator);
  const copies = resolveRepeatCopies(copiesArg, numerator, denominator);

  if (copies == null) {
    return skippedNoteOp(matched); // copy count invalid — warn already emitted, pass through
  }

  const out: NoteEvent[] = [...matched];
  const parents: NoteParents = new Map();

  for (const note of matched) {
    for (let k = 1; k <= copies; k++) {
      const copy = { ...note, start_time: note.start_time + k * offset };

      // A copy landing on an existing note's exact onset+pitch is collapsed
      // keep-last by the write path's dedupe, which says so on the clip's entry.
      out.push(...madeFrom(parents, note, [copy]));
    }
  }

  return { notes: out, skipped: false, parents };
}

/**
 * The repeat offset (a note value or bar duration, already checked to be above
 * 0) as an onset-to-onset (start-to-start) displacement in Ableton beats — each
 * copy is shifted by k × offset from the original note's start, keeping its
 * duration.
 * @param arg - The offset argument node
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The per-copy offset in Ableton beats
 */
function repeatOffset(
  arg: ExpressionNode,
  numerator: number,
  denominator: number,
): number {
  // A note value / bar duration is a pure constant — evaluates to musical beats.
  const musicalBeats = evaluateExpression(
    arg,
    constantEvalContext(numerator, denominator),
  );

  return musicalBeats * (4 / denominator); // musical -> Ableton
}

/**
 * Resolve the optional copy-count argument to a whole number of echoes (>= 1),
 * clamped to MAX_NOTE_PIECES. A missing argument defaults to 1 (a single echo).
 * Returns null and warns when an explicit argument is unusable.
 * @param arg - The (already-parsed) copy-count node, or undefined for the default
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The number of copies, or null to skip
 */
function resolveRepeatCopies(
  arg: ExpressionNode | undefined,
  numerator: number,
  denominator: number,
): number | null {
  if (arg == null) {
    return 1; // default — a single echo
  }

  const value = numericOpArg(
    arg,
    numerator,
    denominator,
    "repeat() copy count",
  );

  if (value == null) {
    return null;
  }

  const copies = Math.round(value);

  if (copies < 1) {
    console.warn(
      `repeat(offset, ${value}) needs a copy count of 1 or more; skipping`,
    );

    return null;
  }

  if (copies > MAX_NOTE_PIECES) {
    console.clipDetail(
      `repeat: copy count clamped to the max of ${MAX_NOTE_PIECES}`,
    );

    return MAX_NOTE_PIECES;
  }

  return copies;
}
