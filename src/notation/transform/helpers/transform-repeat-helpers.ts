// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  type ExpressionNode,
  type NoteOp,
} from "../parser/transform-parser.ts";
import { MAX_NOTE_PIECES } from "./note-cut-helpers.ts";
import { evaluateExpression } from "./transform-evaluator-helpers.ts";

/**
 * Repeat (echo) matched notes: keep the originals and emit `count - 1`
 * time-shifted copies of each, the k-th copy displaced by `k * offset`.
 *
 * Unlike duplicateLoop this does NOT resize the clip — copies landing past the
 * clip's end are still emitted (hidden in Live until the clip is lengthened),
 * consistent with transforms never changing clip length.
 *   - repeat(3, n/8)  → original + 2 copies at +1 and +2 eighth notes
 *   - repeat(2, 1bar) → original + 1 copy one bar later
 * `count` is the TOTAL number of instances (>= 2, clamped to MAX_NOTE_PIECES);
 * `offset` is a note value (n/X) or bar duration (Nbar), greater than 0. Invalid
 * args warn-and-skip (notes pass through unchanged), consistent with update-tool
 * error handling.
 * @param matched - Notes selected by the op
 * @param op - The repeat operation (args: count expression, offset duration)
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The originals plus their time-shifted copies
 */
export function repeatNotes(
  matched: NoteEvent[],
  op: NoteOp,
  numerator: number,
  denominator: number,
): NoteEvent[] {
  // repeat args are always expressions (bar|beat points only reach `split`).
  const countArg = op.args[0] as ExpressionNode | undefined;
  const offsetArg = op.args[1] as ExpressionNode | undefined;

  if (op.args.length < 2 || countArg == null || offsetArg == null) {
    console.warn(
      "repeat() needs a count and an offset, e.g. repeat(3, n/8) or repeat(2, 1bar); skipping",
    );

    return matched;
  }

  if (op.args.length > 2) {
    console.warn(
      "repeat() takes a count and an offset; using the first two arguments",
    );
  }

  const count = resolveRepeatCount(countArg, numerator, denominator);

  if (count == null) {
    return matched; // count invalid — warn already emitted, pass through
  }

  const offset = resolveRepeatOffset(offsetArg, numerator, denominator);

  if (offset == null) {
    return matched; // offset invalid — warn already emitted, pass through
  }

  const out: NoteEvent[] = [...matched];

  for (const note of matched) {
    for (let k = 1; k < count; k++) {
      out.push({ ...note, start_time: note.start_time + k * offset });
    }
  }

  return out;
}

/**
 * Resolve the repeat count argument to a whole instance total (>= 2), clamped to
 * MAX_NOTE_PIECES. Returns null and warns when the argument is unusable.
 * @param arg - The (already-parsed) count argument node
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The instance count, or null to skip
 */
function resolveRepeatCount(
  arg: ExpressionNode,
  numerator: number,
  denominator: number,
): number | null {
  // A bare pitch literal (`repeat(C2, n/8)`) is nonsensical as a count and would
  // silently coerce to its MIDI number — warn-and-skip, mirroring ratchet.
  if (typeof arg === "object" && arg.type === "pitchLiteral") {
    console.warn(
      `pitch name "${arg.name}" isn't a valid repeat count; use a number like repeat(3, n/8). Skipping repeat.`,
    );

    return null;
  }

  let value: number;

  try {
    // Args are constants (no per-note context); a count evaluates to a number.
    // evaluateExpression throws on a non-finite result (e.g. an overflow), so a
    // returned value is always finite here.
    value = evaluateExpression(arg, 0, numerator, denominator, {
      start: 0,
      end: 0,
    });
  } catch (error) {
    console.warn(
      `repeat() count could not be evaluated (${errorMessage(error)}); skipping`,
    );

    return null;
  }

  const count = Math.round(value);

  if (count < 2) {
    console.warn(`repeat(${value}, …) needs a count of 2 or more; skipping`);

    return null;
  }

  if (count > MAX_NOTE_PIECES) {
    console.warn(
      `repeat: count clamped to the max of ${MAX_NOTE_PIECES} instances`,
    );

    return MAX_NOTE_PIECES;
  }

  return count;
}

/**
 * Resolve the repeat offset argument (a note value or bar duration) to an
 * edge-to-edge displacement in Ableton beats. Any other argument warns and
 * returns null so the caller skips the repeat.
 * @param arg - The (already-parsed) offset argument node
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The per-copy offset in Ableton beats, or null to skip
 */
function resolveRepeatOffset(
  arg: ExpressionNode,
  numerator: number,
  denominator: number,
): number | null {
  const isDuration =
    typeof arg === "object" &&
    (arg.type === "nDuration" || arg.type === "barDuration");

  if (!isDuration) {
    console.warn(
      "repeat() offset must be a note value like n/8 or a bar duration like 1bar; skipping",
    );

    return null;
  }

  // A note value / bar duration is a pure constant — evaluates to musical beats.
  const musicalBeats = evaluateExpression(arg, 0, numerator, denominator, {
    start: 0,
    end: 0,
  });
  const abletonBeats = musicalBeats * (4 / denominator); // musical -> Ableton

  if (abletonBeats <= 0) {
    console.warn("repeat() offset must be greater than 0; skipping");

    return null;
  }

  return abletonBeats;
}
