// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Writing Live's envelope events as notation: how a jump pair collapses, how a
// curve reads, and what a point carries.

import { describe, expect, it } from "vitest";
import { type CurveCoefficients } from "#src/notation/barbeat/envelope/envelope-curves.ts";
import {
  type EnvelopeNotationEvent,
  formatEnvelopeNotation,
  parseEnvelopeNotation,
} from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { RAMP_ENDING_IN_JUMP } from "#src/notation/barbeat/envelope/tests/envelope-notation-test-helpers.ts";

const FOUR_FOUR = { timeSigNumerator: 4, timeSigDenominator: 4 };
const SIX_EIGHT = { timeSigNumerator: 6, timeSigDenominator: 8 };

const STRAIGHT: CurveCoefficients = [0.5, 0.5, 0.5, 0.5];

/**
 * Spell events the way the remote script hands them over.
 * @param events - time, value and optional display, in order
 * @returns The events as the formatter takes them
 */
function events(
  ...points: [number, number, string?][]
): EnvelopeNotationEvent[] {
  return points.map(([time, value, display]) => ({ time, value, display }));
}

/**
 * Two events a ramp apart, the first carrying a curve.
 * @param coefficients - The curve of the segment the first event starts
 * @param from - The first value
 * @param to - The second value
 * @returns The events as the formatter takes them
 */
function curved(
  coefficients: CurveCoefficients,
  from: number,
  to: number,
): EnvelopeNotationEvent[] {
  return [
    { time: 0, value: from, coefficients },
    { time: 16, value: to },
  ];
}

describe("formatEnvelopeNotation", () => {
  it("ramps between points at different times", () => {
    expect(
      formatEnvelopeNotation(events([0, -1], [16, 1], [32, -1]), FOUR_FOUR),
    ).toBe("1|1 -1 / 5|1 1 / 9|1 -1");
  });

  it("collapses Live's hold-and-jump pairs into _ connectors", () => {
    expect(
      formatEnvelopeNotation(
        events([0, 0], [0, -0.5], [8, -0.5], [8, 0.5], [32, 0.5], [32, 0]),
        FOUR_FOUR,
      ),
    ).toBe("1|1 -0.5 _ 3|1 0.5 _ 9|1 0");
  });

  it("keeps both points of a ramp that ends in a jump", () => {
    // The pair at beat 8 arrives at 0.25, which is not where the last point
    // left off, so the ramp to it and the jump away are both written.
    expect(
      formatEnvelopeNotation(
        events([0, 0], [8, 0.25], [8, 0.9], [16, 0.9]),
        FOUR_FOUR,
      ),
    ).toBe("1|1 0 / 3|1 0.25 _ 3|1 0.9 / 5|1 0.9");
  });

  it("writes the display only when it says more than the value", () => {
    expect(
      formatEnvelopeNotation(
        events([0, 0.25, "112 Hz"], [16, 0.85, "7.10 kHz"], [32, 0.5, "0.5"]),
        FOUR_FOUR,
      ),
    ).toBe("1|1 0.25 (112 Hz) / 5|1 0.85 (7.10 kHz) / 9|1 0.5");
  });

  it("rounds a value to 3 decimals and trims the zeros", () => {
    expect(
      formatEnvelopeNotation(
        events([0, 0.8500000238], [4, 1], [8, -0.0001]),
        FOUR_FOUR,
      ),
    ).toBe("1|1 0.85 / 2|1 1 / 3|1 0");
  });

  it("spells the times in the clip's own meter", () => {
    expect(formatEnvelopeNotation(events([0, 0], [3, 1]), SIX_EIGHT)).toBe(
      "1|1 0 / 2|1 1",
    );
  });

  it("writes nothing for a clip with no events", () => {
    expect(formatEnvelopeNotation([], FOUR_FOUR)).toBe("");
  });

  it("writes a single event as one point", () => {
    expect(formatEnvelopeNotation(events([4, 0.5]), FOUR_FOUR)).toBe("2|1 0.5");
  });

  it("round-trips its own output", () => {
    const written = formatEnvelopeNotation(
      events([0, 0], [0, -0.5], [8, -0.5], [8, 0.5], [16, 0.25, "25L"]),
      FOUR_FOUR,
    );

    expect(parseEnvelopeNotation(written, FOUR_FOUR)).toStrictEqual([
      { time: 0, value: -0.5, jump: false },
      { time: 8, value: 0.5, jump: true },
      { time: 16, value: 0.25, jump: false },
    ]);
  });

  it("round-trips a ramp that ends in a jump", () => {
    const written = formatEnvelopeNotation(
      events([0, 0], [8, 0.25], [8, 0.9]),
      FOUR_FOUR,
    );

    expect(parseEnvelopeNotation(written, FOUR_FOUR)).toStrictEqual(
      RAMP_ENDING_IN_JUMP,
    );
  });

  it.each([
    ["1/4 (dotted)", "1/4 [dotted]"],
    ["x)", "x]"],
    ["a ( b", "a [ b"],
    ["((a))", "[[a]]"],
  ])("writes the display %j so it reads back", (display, written) => {
    const text = formatEnvelopeNotation(
      events([0, 0.25, display], [8, 0.5, display]),
      FOUR_FOUR,
    );

    expect(text).toBe(`1|1 0.25 (${written}) / 3|1 0.5 (${written})`);
    expect(parseEnvelopeNotation(text, FOUR_FOUR)).toStrictEqual([
      { time: 0, value: 0.25, jump: false },
      { time: 8, value: 0.5, jump: false },
    ]);
  });

  it.each([
    [
      "rising, slow start",
      [0.414062, 0.195312, 0.804688, 0.585938],
      0,
      1,
      "~-0.22",
    ],
    [
      "rising, fast start",
      [0.199219, 0.402344, 0.597656, 0.800781],
      0,
      1,
      "~0.2",
    ],
    ["rising, strongest", [0, 1, 0, 1], 0, 1, "~1"],
    ["rising, strongest slow", [1, 0, 1, 0], 0, 1, "~-1"],
    [
      "falling, fast start",
      [0.183594, 0.449219, 0.550781, 0.816406],
      1,
      0,
      "~-0.27",
    ],
    [
      "falling, slow start",
      [0.425781, 0.191406, 0.808594, 0.574219],
      1,
      0,
      "~0.23",
    ],
    ["falling, strongest", [1, 0, 1, 0], 1, 0, "~1"],
    ["falling, strongest fast", [0, 1, 0, 1], 1, 0, "~-1"],
  ] as [string, CurveCoefficients, number, number, string][])(
    "reads a hand-drawn curve (%s) as %s",
    (_name, coefficients, from, to, connector) => {
      expect(
        formatEnvelopeNotation(curved(coefficients, from, to), FOUR_FOUR),
      ).toBe(`1|1 ${String(from)} ${connector} 5|1 ${String(to)}`);
    },
  );

  it("writes Live's straight coefficients as a straight ramp", () => {
    expect(formatEnvelopeNotation(curved(STRAIGHT, 0, 1), FOUR_FOUR)).toBe(
      "1|1 0 / 5|1 1",
    );
  });

  it("writes a curve that rounds to nothing as a straight ramp", () => {
    expect(
      formatEnvelopeNotation(curved([0.25, 0.25, 0.75, 0.75], 0, 1), FOUR_FOUR),
    ).toBe("1|1 0 / 5|1 1");
  });

  it("writes a curve between equal values as a straight ramp", () => {
    expect(
      formatEnvelopeNotation(curved([0, 1, 0, 1], 0.5, 0.5), FOUR_FOUR),
    ).toBe("1|1 0.5 / 5|1 0.5");
  });

  it("reads a curve that isn't Live's family as the nearest amount", () => {
    expect(
      formatEnvelopeNotation(curved([0.4, 0.2, 0.8, 0.6], 0, 1), FOUR_FOUR),
    ).toBe("1|1 0 ~-0.2 5|1 1");
  });

  it("keeps a curve next to a step", () => {
    const text = formatEnvelopeNotation(
      [
        { time: 0, value: 0 },
        { time: 8, value: 0 },
        { time: 8, value: 1, coefficients: [0, 1, 0, 1] },
        { time: 16, value: 0 },
      ],
      FOUR_FOUR,
    );

    expect(text).toBe("1|1 0 _ 3|1 1 ~-1 5|1 0");
  });

  it("round-trips a curve", () => {
    const text = "1|1 0 ~0.5 3|1 1 ~-0.3 5|1 0.25";

    expect(parseEnvelopeNotation(text, FOUR_FOUR)).toStrictEqual([
      { time: 0, value: 0, jump: false },
      { time: 8, value: 1, jump: false, curve: 0.5 },
      { time: 16, value: 0.25, jump: false, curve: -0.3 },
    ]);
  });
});
