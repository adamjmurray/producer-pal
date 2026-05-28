// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  formatAbsoluteDuration,
  formatBeatPosition,
  formatDecimal,
} from "../helpers/barbeat-serializer-fractions.ts";

describe("formatBeatPosition", () => {
  it("formats integers as-is", () => {
    expect(formatBeatPosition(1)).toBe("1");
    expect(formatBeatPosition(4)).toBe("4");
    expect(formatBeatPosition(10)).toBe("10");
  });

  it("prefers decimal when shorter and lossless", () => {
    // 1.25 (4 chars) < 1+1/4 (5 chars) and lossless → decimal
    expect(formatBeatPosition(1.25)).toBe("1.25");
    // 1.5 (3 chars) < 1+1/2 (5 chars) and lossless → decimal
    expect(formatBeatPosition(1.5)).toBe("1.5");
    // 1.75 (4 chars) < 1+3/4 (5 chars) and lossless → decimal
    expect(formatBeatPosition(1.75)).toBe("1.75");
    // 2.5 (3 chars) < 2+1/2 (5 chars) and lossless → decimal
    expect(formatBeatPosition(2.5)).toBe("2.5");
  });

  it("uses fraction when decimal is lossy (repeating decimals)", () => {
    // 1/3 cannot be represented exactly in 3 decimal places
    expect(formatBeatPosition(1 + 1 / 3)).toBe("1+1/3");
    expect(formatBeatPosition(1 + 2 / 3)).toBe("1+2/3");
    expect(formatBeatPosition(2 + 1 / 3)).toBe("2+1/3");
  });

  it("uses mixed number format for fractional beat positions", () => {
    // Mixed numbers are more readable than whole fractions for beat positions
    expect(formatBeatPosition(4 / 3)).toBe("1+1/3");
    expect(formatBeatPosition(8 / 3)).toBe("2+2/3");
    // 3/2 = 1.5 → decimal is shorter and lossless
    expect(formatBeatPosition(3 / 2)).toBe("1.5");
  });

  it("falls back to decimal for non-fraction values", () => {
    expect(formatBeatPosition(1.123)).toBe("1.123");
    expect(formatBeatPosition(2.789)).toBe("2.789");
  });

  it("uses fraction when decimal is lossy for sixth-based beats", () => {
    // 1/6 = 0.1666... → lossy decimal → fraction required
    expect(formatBeatPosition(1 + 1 / 6)).toBe("1+1/6");
    // 5/6 = 0.8333... → lossy
    expect(formatBeatPosition(1 + 5 / 6)).toBe("1+5/6");
  });

  it("prefers fraction for eighth-based beats when equal or shorter", () => {
    // 1.125 (5 chars) = 1+1/8 (5 chars) → tie → fraction wins
    expect(formatBeatPosition(1.125)).toBe("1+1/8");
    // 1.375 (5 chars) = 1+3/8 (5 chars) → tie → fraction wins
    expect(formatBeatPosition(1.375)).toBe("1+3/8");
    // 1.625 (5 chars) = 1+5/8 (5 chars) → tie → fraction wins
    expect(formatBeatPosition(1.625)).toBe("1+5/8");
    // 1.875 (5 chars) = 1+7/8 (5 chars) → tie → fraction wins
    expect(formatBeatPosition(1.875)).toBe("1+7/8");
  });

  it("uses fraction for sixteenth-based beats (lossy decimals)", () => {
    // 1/16 = 0.0625 → 1.063 (5 chars) is lossy → 1+1/16 (6 chars) required
    expect(formatBeatPosition(1 + 1 / 16)).toBe("1+1/16");
    // 3/16 = 0.1875 → 1.188 (5 chars) is lossy → 1+3/16 (6 chars) required
    expect(formatBeatPosition(1 + 3 / 16)).toBe("1+3/16");
  });

  it("uses fraction for twelfth-based beats (lossy decimals)", () => {
    // 1/12 = 0.08333... → 1.083 (5 chars) is lossy → 1+1/12 (6 chars) required
    expect(formatBeatPosition(1 + 1 / 12)).toBe("1+1/12");
    // 5/12 = 0.41666... → 1.417 (5 chars) is lossy → 1+5/12 (6 chars) required
    expect(formatBeatPosition(1 + 5 / 12)).toBe("1+5/12");
  });
});

describe("formatAbsoluteDuration", () => {
  it("formats common note values with /den shorthand", () => {
    expect(formatAbsoluteDuration(1)).toBe("/1"); // whole
    expect(formatAbsoluteDuration(1 / 2)).toBe("/2"); // half
    expect(formatAbsoluteDuration(1 / 4)).toBe("/4"); // quarter
    expect(formatAbsoluteDuration(1 / 8)).toBe("/8"); // eighth
    expect(formatAbsoluteDuration(1 / 16)).toBe("/16"); // sixteenth
    expect(formatAbsoluteDuration(1 / 32)).toBe("/32"); // thirty-second
  });

  it("formats triplet/tuplet denominators", () => {
    expect(formatAbsoluteDuration(1 / 3)).toBe("/3"); // half-note triplet
    expect(formatAbsoluteDuration(1 / 6)).toBe("/6"); // quarter-note triplet
    expect(formatAbsoluteDuration(1 / 12)).toBe("/12"); // eighth-note triplet
    expect(formatAbsoluteDuration(1 / 24)).toBe("/24"); // sixteenth-note triplet
    expect(formatAbsoluteDuration(1 / 20)).toBe("/20"); // sixteenth quintuplet
  });

  it("formats non-unit numerators", () => {
    expect(formatAbsoluteDuration(3 / 8)).toBe("3/8"); // dotted quarter
    expect(formatAbsoluteDuration(3 / 4)).toBe("3/4"); // dotted half / 3 quarters
    expect(formatAbsoluteDuration(3 / 16)).toBe("3/16"); // dotted eighth
    expect(formatAbsoluteDuration(2 / 3)).toBe("2/3"); // 2 half-note triplets
    expect(formatAbsoluteDuration(5 / 4)).toBe("5/4"); // 5 quarter notes (5/4 bar)
    expect(formatAbsoluteDuration(5 / 8)).toBe("5/8"); // 5 eighth notes
  });

  it("formats values >= 1 (multi-whole-note durations)", () => {
    expect(formatAbsoluteDuration(2)).toBe("2/1"); // 2 whole notes
    expect(formatAbsoluteDuration(4)).toBe("4/1"); // 4 whole notes
  });

  it("prefers smallest denominator", () => {
    // 1/2 reduces from 2/4, 4/8, etc. — should always pick the smallest
    expect(formatAbsoluteDuration(0.5)).toBe("/2");
    expect(formatAbsoluteDuration(0.25)).toBe("/4");
  });

  it("formats zero", () => {
    expect(formatAbsoluteDuration(0)).toBe("0/1");
  });
});

describe("formatDecimal", () => {
  it("formats integers without decimals", () => {
    expect(formatDecimal(0)).toBe("0");
    expect(formatDecimal(1)).toBe("1");
    expect(formatDecimal(100)).toBe("100");
  });

  it("removes trailing zeros", () => {
    expect(formatDecimal(1.5)).toBe("1.5");
    expect(formatDecimal(1.25)).toBe("1.25");
    expect(formatDecimal(0.5)).toBe("0.5");
  });

  it("limits to 3 decimal places", () => {
    expect(formatDecimal(1 / 3)).toBe("0.333");
    expect(formatDecimal(2 / 3)).toBe("0.667");
  });
});
