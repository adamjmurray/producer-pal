// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { differsAtPublishedResolution } from "#src/tools/shared/helpers/read-back-comparison.ts";
import {
  asFiniteNumber,
  round2dp,
  roundBeats,
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

describe("differsAtPublishedResolution", () => {
  it("counts a value that rounds the same as the same", () => {
    expect(differsAtPublishedResolution(-6.333333, -6.33, roundGainDb)).toBe(
      false,
    );
    expect(
      differsAtPublishedResolution(0.1, Math.fround(0.1), undefined, true),
    ).toBe(false);
  });

  it("counts a different value as different", () => {
    expect(differsAtPublishedResolution(-6, -6.5, roundGainDb)).toBe(true);
    expect(differsAtPublishedResolution(120, 140.5, round2dp)).toBe(true);
  });

  it("always reports a read-back that isn't a number", () => {
    expect(differsAtPublishedResolution(0, "-inf", roundGainDb)).toBe(true);
    expect(differsAtPublishedResolution(0, undefined, roundGainDb)).toBe(true);
  });

  // A position Live stores as a float32: a request sitting on a rounding
  // boundary rounds up as written and down once stored, and that is still the
  // value written.
  it.each([1.0005, 1.0035, 1.0135])(
    "counts a beat position of %s as kept when Live stored it as a float32",
    (value) => {
      expect(roundBeats(Math.fround(value))).not.toBe(roundBeats(value));
      expect(
        differsAtPublishedResolution(
          value,
          Math.fround(value),
          roundBeats,
          true,
        ),
      ).toBe(false);
    },
  );

  // A send's dB is read off a linear gain, not stored as a float32, so the same
  // boundary there is a value Live changed.
  it.each([
    [3.135, round2dp],
    [-8.975, roundGainDb],
    [1.0035, roundBeats],
  ])("does not give %s the float32 allowance unless asked", (value, round) => {
    expect(differsAtPublishedResolution(value, Math.fround(value), round)).toBe(
      true,
    );
  });

  it("still reports a real difference at a boundary", () => {
    expect(differsAtPublishedResolution(1.0035, 1.01, roundBeats, true)).toBe(
      true,
    );
  });
});
