// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Cross-grammar parity for the duration / note-value / `±n`-offset sub-grammar.
//
// The note-value language is implemented by independent parsers that cannot
// share a rule (Peggy compiles each grammar separately and cannot import):
//
//   Duration sites (token → Ableton beats)
//     1. durationToAbletonBeats        (regex, barbeat-time.ts)
//     2. barbeat `duration` rule       (barbeat-grammar.peggy)
//     3. transform nDuration/barDuration (transform-grammar.peggy)
//
//   `±n` beat-offset sites (a `bar|beat` beat field → absolute musical beats)
//     4. parseBeatValue / barBeatToBeats (regex, barbeat-time.ts)
//     5. barbeat `beatValue` rule        (barbeat-grammar.peggy)
//     6. transform `beatValue` rule      (transform-grammar.peggy, in timeRange)
//
// This test feeds one corpus through every site and asserts they accept/reject
// the same language and compute matching values where they overlap. It is the
// single source of truth that keeps the sites from silently diverging again
// (the intent stated in skills/standard.ts: "same `n` fraction grammar
// everywhere"), and it pins the two deliberate, documented divergences:
//   - `Nbar` is a note value on every surface (closed by allowing it in the
//     transform grammar);
//   - a bare number / bare fraction is never a note-value duration; and
//   - the decimal-numerator off-grid escape (`n1.9638/4`) is read-back-only —
//     emitted and re-read by durationToAbletonBeats but rejected by the two
//     authoring grammars.

import { describe, expect, it } from "vitest";
import { parse as parseBarbeat } from "#src/notation/barbeat/parser/barbeat-parser.ts";
import {
  barBeatToBeats,
  durationToAbletonBeats,
  timeSigToAbletonBeatsPerBar,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { evaluateExpression } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { parse as parseTransform } from "#src/notation/transform/parser/transform-parser.ts";

// Meters spanning /4, /8, and /2 denominators so the time-sig-denominator factor
// (whole-note fraction → musical/Ableton beats) is exercised, not just /4.
const METERS: ReadonlyArray<readonly [number, number]> = [
  [4, 4],
  [6, 8],
  [3, 4],
  [2, 2],
  [9, 8],
];

// ---- Duration sites: token → Ableton beats (throws when the site rejects) ----

function durationViaRegex(token: string, num: number, den: number): number {
  return durationToAbletonBeats(token, num, den);
}

function durationViaBarbeat(token: string, num: number, den: number): number {
  const els = parseBarbeat(token, {
    beatsPerBar: num,
    timeSigDenominator: den,
  });
  const el = els[0];

  if (els.length !== 1 || el?.duration == null) {
    throw new Error(`barbeat did not parse "${token}" as a single duration`);
  }

  // `duration` is a whole-note fraction; `bars` is meter-aware (same conversion
  // durationToAbletonBeats performs): bars * Ableton-beats-per-bar + frac * 4.
  return (
    (el.bars ?? 0) * timeSigToAbletonBeatsPerBar(num, den) + el.duration * 4
  );
}

function durationViaTransform(token: string, num: number, den: number): number {
  const assigns = parseTransform(`duration = ${token}`, {
    beatsPerBar: num,
    timeSigDenominator: den,
  });
  const expr = assigns[0]?.expression;

  if (expr == null) {
    throw new Error(`transform did not parse duration "${token}"`);
  }

  const musicalBeats = evaluateExpression(
    expr,
    0,
    num,
    den,
    { start: 0, end: 0 },
    {},
  );

  return musicalBeats * (4 / den); // musical beats → Ableton beats
}

const DURATION_SITES = [
  { name: "durationToAbletonBeats", fn: durationViaRegex },
  { name: "barbeat duration rule", fn: durationViaBarbeat },
  { name: "transform nDuration/barDuration", fn: durationViaTransform },
] as const;

// Does the transform duration expression contain a note-value node (nDuration /
// barDuration) anywhere? A bare number (`5`) or bare arithmetic (`1/4`) does
// not — the `n`/`bar` sigils are what mark a note value in the transform grammar.
function transformIsNoteValueDuration(
  token: string,
  num: number,
  den: number,
): boolean {
  const assigns = parseTransform(`duration = ${token}`, {
    beatsPerBar: num,
    timeSigDenominator: den,
  });

  return containsNoteValueNode(assigns[0]?.expression);
}

function containsNoteValueNode(expr: unknown): boolean {
  if (typeof expr !== "object" || expr == null) {
    return false;
  }

  const node = expr as { type?: string; left?: unknown; right?: unknown };

  if (node.type === "nDuration" || node.type === "barDuration") {
    return true;
  }

  return containsNoteValueNode(node.left) || containsNoteValueNode(node.right);
}

// ---- Offset sites: a `bar|beat` beat field → absolute musical beats ----

function offsetViaRegex(beat: string, num: number, den: number): number {
  return barBeatToBeats(`1|${beat}`, num, den);
}

function offsetViaBarbeat(beat: string, num: number, den: number): number {
  const els = parseBarbeat(`1|${beat}`, {
    beatsPerBar: num,
    timeSigDenominator: den,
  });
  const el = els[0];

  if (el?.bar == null || typeof el.beat !== "number") {
    throw new Error(`barbeat did not parse "1|${beat}" as a single time point`);
  }

  return (el.bar - 1) * num + (el.beat - 1);
}

function offsetViaTransform(beat: string, num: number, den: number): number {
  const assigns = parseTransform(`1|${beat}-9|1: velocity += 1`, {
    beatsPerBar: num,
    timeSigDenominator: den,
  });
  const tr = assigns[0]?.timeRange;

  if (tr == null) {
    throw new Error(`transform did not parse timeRange "1|${beat}-9|1"`);
  }

  return (tr.startBar - 1) * num + (tr.startBeat - 1);
}

const OFFSET_SITES = [
  { name: "barBeatToBeats / parseBeatValue", fn: offsetViaRegex },
  { name: "barbeat beatValue rule", fn: offsetViaBarbeat },
  { name: "transform beatValue rule", fn: offsetViaTransform },
] as const;

describe("note-value grammar parity across all parse sites", () => {
  describe("canonical note-value durations agree across all duration sites", () => {
    // n<frac> (numerator omitted → 1), Nbar, and the mixed Nbar+n<frac> form.
    const TOKENS = [
      "n/4",
      "n/8",
      "n/12",
      "n3/4",
      "n/16",
      "n5/8",
      "1bar",
      "2bar",
      "1bar+n/4",
      "3bar+n3/8",
    ];

    for (const [num, den] of METERS) {
      for (const token of TOKENS) {
        it(`"${token}" → identical Ableton beats in ${num}/${den}`, () => {
          const ref = durationViaRegex(token, num, den);

          expect(ref).toBeGreaterThan(0);

          for (const site of DURATION_SITES) {
            expect(site.fn(token, num, den)).toBeCloseTo(ref, 9);
          }
        });
      }
    }
  });

  describe("Nbar is a note value on every duration surface", () => {
    // Regression lock: the transform grammar once lacked Nbar entirely.
    for (const token of ["1bar", "4bar", "1bar+n/4"]) {
      it(`transform accepts "${token}" as a note value`, () => {
        expect(transformIsNoteValueDuration(token, 4, 4)).toBe(true);
        expect(() => durationViaTransform(token, 4, 4)).not.toThrow();
      });
    }
  });

  describe("a bare number / bare fraction is never a note-value duration", () => {
    // Regression lock: durationToAbletonBeats once accepted bare numbers.
    for (const token of ["5", "1.5", "2", "1/4"]) {
      it(`"${token}" is rejected by the authoring duration sites`, () => {
        expect(() => durationViaRegex(token, 4, 4)).toThrow();
        expect(() => durationViaBarbeat(token, 4, 4)).toThrow();
        // The transform grammar parses it only as arithmetic, never as a note
        // value — the `n`/`bar` sigils are what mark a note value.
        expect(transformIsNoteValueDuration(token, 4, 4)).toBe(false);
      });
    }
  });

  describe("the decimal-numerator off-grid escape is duration-read-only", () => {
    // `n<beats>/4` is the sample-derived length escape abletonBeatsToDuration
    // emits; only its own reader (durationToAbletonBeats) accepts a decimal
    // numerator. The two authoring grammars reject it by design.
    const token = "n1.9638/4";

    it("durationToAbletonBeats reads it back (the off-grid escape)", () => {
      expect(durationViaRegex(token, 4, 4)).toBeCloseTo(1.9638, 9);
    });

    it("the barbeat duration grammar rejects it", () => {
      expect(() => durationViaBarbeat(token, 4, 4)).toThrow();
    });

    it("the transform duration grammar rejects it", () => {
      expect(() => durationViaTransform(token, 4, 4)).toThrow();
    });
  });

  describe("±n beat offsets agree across all offset sites", () => {
    // Plain grid beats, dyadic decimals, and `±n` note-value offsets — including
    // a `-n` that borrows below beat 1 into negative time (a note before 1|1).
    const TOKENS = [
      "1",
      "1.5",
      "2",
      "1+n/12",
      "2-n/24",
      "1+n/8",
      "1-n/12",
      "2-n3/16",
      "1+n5/12",
    ];

    for (const [num, den] of METERS) {
      for (const token of TOKENS) {
        it(`"1|${token}" → identical absolute musical beats in ${num}/${den}`, () => {
          const ref = offsetViaRegex(token, num, den);

          for (const site of OFFSET_SITES) {
            expect(site.fn(token, num, den)).toBeCloseTo(ref, 9);
          }
        });
      }
    }
  });

  describe("bare fractions and mixed numbers are rejected by all offset sites", () => {
    for (const beat of ["4/3", "1+1/3", "1+2/3"]) {
      it(`"1|${beat}" is rejected everywhere`, () => {
        for (const site of OFFSET_SITES) {
          expect(() => site.fn(beat, 4, 4)).toThrow();
        }
      });
    }
  });
});
