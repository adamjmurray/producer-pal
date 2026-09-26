// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Writing Live's envelope events as notation: how a jump pair collapses, and
// what a point carries.

import { describe, expect, it } from "vitest";
import {
  type EnvelopeNotationEvent,
  formatEnvelopeNotation,
  parseEnvelopeNotation,
} from "#src/notation/barbeat/envelope/envelope-notation.ts";

const FOUR_FOUR = { timeSigNumerator: 4, timeSigDenominator: 4 };
const SIX_EIGHT = { timeSigNumerator: 6, timeSigDenominator: 8 };

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

describe("formatEnvelopeNotation", () => {
  it("ramps between points at different times", () => {
    expect(
      formatEnvelopeNotation(events([0, -1], [16, 1], [32, -1]), FOUR_FOUR),
    ).toBe("1|1 -1 ~ 5|1 1 ~ 9|1 -1");
  });

  it("collapses Live's hold-and-jump pairs into > connectors", () => {
    expect(
      formatEnvelopeNotation(
        events([0, 0], [0, -0.5], [8, -0.5], [8, 0.5], [32, 0.5], [32, 0]),
        FOUR_FOUR,
      ),
    ).toBe("1|1 -0.5 > 3|1 0.5 > 9|1 0");
  });

  it("keeps both points of a ramp that ends in a jump", () => {
    // The pair at beat 8 arrives at 0.25, which is not where the last point
    // left off, so the ramp to it and the jump away are both written.
    expect(
      formatEnvelopeNotation(
        events([0, 0], [8, 0.25], [8, 0.9], [16, 0.9]),
        FOUR_FOUR,
      ),
    ).toBe("1|1 0 ~ 3|1 0.25 > 3|1 0.9 ~ 5|1 0.9");
  });

  it("writes the display only when it says more than the value", () => {
    expect(
      formatEnvelopeNotation(
        events([0, 0.25, "112 Hz"], [16, 0.85, "7.10 kHz"], [32, 0.5, "0.5"]),
        FOUR_FOUR,
      ),
    ).toBe("1|1 0.25 (112 Hz) ~ 5|1 0.85 (7.10 kHz) ~ 9|1 0.5");
  });

  it("rounds a value to 3 decimals and trims the zeros", () => {
    expect(
      formatEnvelopeNotation(
        events([0, 0.8500000238], [4, 1], [8, -0.0001]),
        FOUR_FOUR,
      ),
    ).toBe("1|1 0.85 ~ 2|1 1 ~ 3|1 0");
  });

  it("spells the times in the clip's own meter", () => {
    expect(formatEnvelopeNotation(events([0, 0], [3, 1]), SIX_EIGHT)).toBe(
      "1|1 0 ~ 2|1 1",
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

    expect(parseEnvelopeNotation(written, FOUR_FOUR)).toStrictEqual([
      { time: 0, value: 0, jump: false },
      { time: 8, value: 0.25, jump: false },
      { time: 8, value: 0.9, jump: true },
    ]);
  });
});
