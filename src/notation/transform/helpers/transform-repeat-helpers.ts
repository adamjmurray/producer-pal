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
 * Repeat (echo) matched notes: keep the originals and emit `copies` time-shifted
 * copies of each, the k-th copy displaced by `k * offset`.
 *
 * Unlike duplicateLoop this does NOT resize the clip — copies landing past the
 * clip's end are still emitted (hidden in Live until the clip is lengthened),
 * consistent with transforms never changing clip length.
 *   - repeat(n/8)     → original + 1 echo an eighth note later
 *   - repeat(n/8, 2)  → original + 2 copies at +1 and +2 eighth notes
 *   - repeat(1bar, 3) → original + 3 copies, each a further bar on
 * `offset` (first arg, required) is a note value (n/X) or bar duration (Nbar),
 * greater than 0. `copies` (second arg, optional, default 1) is the number of
 * echoes (>= 1, clamped to MAX_NOTE_PIECES). Invalid args warn-and-skip (notes
 * pass through unchanged), consistent with update-tool error handling.
 * @param matched - Notes selected by the op
 * @param op - The repeat operation (args: offset duration, optional copy count)
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
  const offsetArg = op.args[0] as ExpressionNode | undefined;
  const copiesArg = op.args[1] as ExpressionNode | undefined;

  if (op.args.length === 0 || offsetArg == null) {
    console.warn(
      "repeat() needs an offset, e.g. repeat(n/8) or repeat(1bar); skipping",
    );

    return matched;
  }

  if (op.args.length > 2) {
    console.warn(
      "repeat() takes an offset and an optional copy count; using the first two arguments",
    );
  }

  const offset = resolveRepeatOffset(offsetArg, numerator, denominator);

  if (offset == null) {
    return matched; // offset invalid — warn already emitted, pass through
  }

  const copies = resolveRepeatCopies(copiesArg, numerator, denominator);

  if (copies == null) {
    return matched; // copy count invalid — warn already emitted, pass through
  }

  const out: NoteEvent[] = [...matched];

  for (const note of matched) {
    for (let k = 1; k <= copies; k++) {
      out.push({ ...note, start_time: note.start_time + k * offset });
    }
  }

  return out;
}

/**
 * Resolve the repeat offset argument (a note value or bar duration) to an
 * onset-to-onset (start-to-start) displacement in Ableton beats — each copy is
 * shifted by k × offset from the original note's start, keeping its duration.
 * Any other argument warns and returns null so the caller skips the repeat.
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

  // A bare pitch literal (`repeat(n/8, C2)`) is nonsensical as a count and would
  // silently coerce to its MIDI number — warn-and-skip, mirroring ratchet.
  if (typeof arg === "object" && arg.type === "pitchLiteral") {
    console.warn(
      `pitch name "${arg.name}" isn't a valid repeat copy count; use a number like repeat(n/8, 3). Skipping repeat.`,
    );

    return null;
  }

  let value: number;

  try {
    // Args are constants (no per-note context); a count evaluates to a number.
    // evaluateExpression only throws on non-finite for pow(); plain arithmetic
    // can still overflow to ±Infinity or yield NaN, so guard explicitly below.
    value = evaluateExpression(arg, 0, numerator, denominator, {
      start: 0,
      end: 0,
    });
  } catch (error) {
    console.warn(
      `repeat() copy count could not be evaluated (${errorMessage(error)}); skipping`,
    );

    return null;
  }

  // A non-finite count (e.g. Infinity - Infinity = NaN) would slip past both
  // guards below — NaN < 1 and NaN > MAX are both false — and the caller's
  // `k <= NaN` loop would silently emit zero copies. Warn-and-skip instead,
  // mirroring resolveRatchetPlan.
  if (!Number.isFinite(value)) {
    console.warn(`repeat() copy count must be a finite number; skipping`);

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
    console.warn(`repeat: copy count clamped to the max of ${MAX_NOTE_PIECES}`);

    return MAX_NOTE_PIECES;
  }

  return copies;
}
