// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  formatBeatPosition,
  formatDecimal,
  formatUnsignedValue,
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

describe("formatUnsignedValue", () => {
  it("formats integers as-is", () => {
    expect(formatUnsignedValue(0)).toBe("0");
    expect(formatUnsignedValue(1)).toBe("1");
    expect(formatUnsignedValue(4)).toBe("4");
  });

  it("formats common sub-beat durations with /den shorthand", () => {
    expect(formatUnsignedValue(0.25)).toBe("/4");
    expect(formatUnsignedValue(0.5)).toBe("/2");
    expect(formatUnsignedValue(1 / 3)).toBe("/3");
    expect(formatUnsignedValue(1 / 6)).toBe("/6");
    expect(formatUnsignedValue(0.125)).toBe("/8");
    expect(formatUnsignedValue(1 / 16)).toBe("/16");
    expect(formatUnsignedValue(1 / 12)).toBe("/12");
  });

  it("formats non-unit fractions < 1", () => {
    expect(formatUnsignedValue(0.75)).toBe("3/4");
    expect(formatUnsignedValue(2 / 3)).toBe("2/3");
    expect(formatUnsignedValue(3 / 8)).toBe("3/8");
    expect(formatUnsignedValue(5 / 6)).toBe("5/6");
  });

  it("uses fraction for mixed number durations when lossy or equal", () => {
    // 1+1/3 — 1/3 is lossy → fraction required
    expect(formatUnsignedValue(1 + 1 / 3)).toBe("1+1/3");
    // 2+2/3 — 2/3 is lossy → fraction required
    expect(formatUnsignedValue(2 + 2 / 3)).toBe("2+2/3");
  });

  it("prefers decimal when shorter and lossless for >= 1 values", () => {
    // 1.5 (3 chars) < 1+1/2 (5 chars) and lossless → decimal
    expect(formatUnsignedValue(1.5)).toBe("1.5");
    // 2.25 (4 chars) < 2+1/4 (5 chars) and lossless → decimal
    expect(formatUnsignedValue(2.25)).toBe("2.25");
  });

  it("falls back to decimal for non-fraction values", () => {
    expect(formatUnsignedValue(0.123)).toBe("0.123");
    expect(formatUnsignedValue(1.789)).toBe("1.789");
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
