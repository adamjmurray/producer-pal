// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { sortNotes } from "../../barbeat-test-helpers.ts";
import { interpretNotation } from "../../interpreter/barbeat-interpreter.ts";
import { formatNotation } from "../barbeat-serializer.ts";
import { expectRoundTripNotes } from "./barbeat-serializer-test-helpers.ts";

/**
 * Pattern brackets (`[...]`) are author-only sugar: they never reach the
 * serializer, which runs over emitted `NoteEvent[]` and always emits explicit
 * positions. This locks three properties that together guarantee that contract:
 *
 * 1. A bracketed form and its hand-expanded explicit form interpret to the SAME
 *    notes (the bracket is exactly its expansion — no hidden behavior).
 * 2. The serialized canonical form is bracket-free (read-back is never
 *    re-bracketed).
 * 3. Re-interpreting the serialized form reproduces the notes (lossless).
 *
 * @param bracketed - The bracket-sugar input
 * @param explicit - The hand-written explicit equivalent (no brackets)
 * @param options - Time-signature options for both interpret and serialize
 * @param options.timeSigNumerator - Time signature numerator
 * @param options.timeSigDenominator - Time signature denominator
 */
function expectBracketSugar(
  bracketed: string,
  explicit: string,
  options: { timeSigNumerator?: number; timeSigDenominator?: number } = {},
): void {
  const fromBracket = interpretNotation(bracketed, options);
  const fromExplicit = interpretNotation(explicit, options);

  expect(sortNotes(fromBracket)).toStrictEqual(sortNotes(fromExplicit));

  const serialized = formatNotation(fromBracket, options);

  expect(serialized).not.toMatch(/[[\]]/);
  expectRoundTripNotes(fromBracket as NoteEvent[], options);
}

describe("pattern brackets are author-only sugar (never serialized)", () => {
  it("pitch stream expands to explicit positions", () => {
    expectBracketSugar("n/4 [C3 E3 G3] 1|1x3@n/4", "n/4 C3 1|1 E3 1|2 G3 1|3");
  });

  it("zipped velocity + pitch streams expand to explicit notes", () => {
    expectBracketSugar(
      "n/8 [v80 v100] [C3 E3 G3] 1|1x6@n/8",
      "n/8 v80 C3 1|1 v100 E3 1|1.5 v80 G3 1|2 v100 C3 1|2.5 v80 E3 1|3 v100 G3 1|3.5",
    );
  });

  it("duration-fold gallop expands to explicit positions + lengths", () => {
    expectBracketSugar(
      "[n/4 n/8] C3 1|1x8",
      "n/4 C3 1|1 n/8 C3 1|2 n/4 C3 1|2.5 n/8 C3 1|3.5 n/4 C3 1|4 n/8 C3 2|1 n/4 C3 2|1.5 n/8 C3 2|2.5",
    );
  });

  it("probability stream expands to explicit per-note probabilities", () => {
    expectBracketSugar(
      "n/4 [p1 p0.5] C3 1|1x4@n/4",
      "n/4 p1 C3 1|1 p0.5 C3 1|2 p1 C3 1|3 p0.5 C3 1|4",
    );
  });

  it("chord-stream steps expand to explicit chords", () => {
    expectBracketSugar(
      "n/4 [(C3 E3) (D3 F3)] 1|1x2@n/4",
      "n/4 C3 E3 1|1 D3 F3 1|2",
    );
  });

  it("layered pitch voices expand to explicit chords", () => {
    // Two pitch voices (lengths 2 and 3) phase into chords; the serialized form
    // is the explicit chord-per-position expansion, not re-bracketed.
    expectBracketSugar(
      "n/4 [C3 C4] [E3 G3 E4] 1|1,2,3,4",
      "n/4 C3 E3 1|1 C4 G3 1|2 C3 E4 1|3 C4 E3 1|4",
    );
  });

  it("pitch stream in 6/8 expands meter-correctly", () => {
    expectBracketSugar("n/8 [C3 E3 G3] 1|1x3@n/8", "n/8 C3 1|1 E3 1|2 G3 1|3", {
      timeSigNumerator: 6,
      timeSigDenominator: 8,
    });
  });
});
