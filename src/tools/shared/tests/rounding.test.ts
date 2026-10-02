// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  asFiniteNumber,
  round2dp,
  roundDisplayValue,
  roundGainDb,
  roundPan,
} from "#src/tools/shared/helpers/rounding.ts";

describe("roundPan", () => {
  it("rounds to two decimals", () => {
    expect(roundPan(-0.30000001192092896)).toBe(-0.3);
    expect(roundPan(0.125)).toBe(0.13);
    expect(roundPan(1)).toBe(1);
    expect(roundPan(0)).toBe(0);
  });
});

describe("round2dp", () => {
  it("rounds to two decimals", () => {
    expect(round2dp(123.456787109375)).toBe(123.46);
    expect(round2dp(-6.333000183105469)).toBe(-6.33);
  });
});

describe("asFiniteNumber", () => {
  it("passes a number through", () => {
    expect(asFiniteNumber(123.456)).toBe(123.456);
  });

  it("parses a numeric string, including exponent notation", () => {
    expect(asFiniteNumber("9.999999747378752e-05")).toBeCloseTo(0.0001);
    expect(asFiniteNumber("42")).toBe(42);
  });

  it("returns undefined for a non-numeric value", () => {
    expect(asFiniteNumber("C")).toBeUndefined();
    expect(asFiniteNumber(null)).toBeUndefined();
    expect(asFiniteNumber(undefined)).toBeUndefined();
    expect(asFiniteNumber(Infinity)).toBeUndefined();
  });
});

describe("roundDisplayValue", () => {
  it("rounds a number with the given rounding function", () => {
    expect(roundDisplayValue(-6.333000183105469, roundGainDb)).toBe(-6.33);
  });

  it("parses and rounds a numeric string Max serialized in exponent notation", () => {
    expect(roundDisplayValue("9.999999747378752e-05", roundPan)).toBe(0);
  });

  it("passes through a non-numeric value unchanged", () => {
    expect(roundDisplayValue("C", roundPan)).toBe("C");
    expect(roundDisplayValue(undefined, roundPan)).toBeUndefined();
  });
});
