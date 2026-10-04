// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The `~N` amount and Live's bezier coefficients, both ways.

import { describe, expect, it } from "vitest";
import {
  type CurveCoefficients,
  coefficientsToCurve,
  curveToCoefficients,
  STRAIGHT_COEFFICIENTS,
} from "#src/notation/barbeat/envelope/envelope-curves.ts";

/**
 * Round each coefficient to 1/256, as Live's editor does.
 * @param coefficients - The coefficients to quantize
 * @returns The quantized coefficients
 */
function quantize(coefficients: CurveCoefficients): CurveCoefficients {
  return coefficients.map(
    (c) => Math.round(c * 256) / 256,
  ) as CurveCoefficients;
}

describe("curveToCoefficients", () => {
  it.each([
    // [amount, rising, coefficients]
    [0.5, true, [0.125, 0.625, 0.375, 0.875]],
    [-0.5, true, [0.625, 0.125, 0.875, 0.375]],
    [0.5, false, [0.625, 0.125, 0.875, 0.375]],
    [-0.5, false, [0.125, 0.625, 0.375, 0.875]],
    [1, true, [0, 1, 0, 1]],
    [-1, true, [1, 0, 1, 0]],
    [1, false, [1, 0, 1, 0]],
    [-1, false, [0, 1, 0, 1]],
  ] as [number, boolean, CurveCoefficients][])(
    "draws %s on a ramp that rises: %s",
    (amount, rising, expected) => {
      expect(curveToCoefficients(amount, rising)).toStrictEqual(expected);
    },
  );

  it("writes Live's own straight line for 0, whichever way it runs", () => {
    expect(curveToCoefficients(0, true)).toStrictEqual(STRAIGHT_COEFFICIENTS);
    expect(curveToCoefficients(0, false)).toStrictEqual(STRAIGHT_COEFFICIENTS);
  });
});

describe("coefficientsToCurve", () => {
  it.each([
    [[0.5, 0.5, 0.5, 0.5], true, 0],
    [[0.25, 0.25, 0.75, 0.75], false, 0],
    [[0.199219, 0.402344, 0.597656, 0.800781], true, 0.2],
    [[0, 1, 0, 1], true, 1],
    [[0.414062, 0.195312, 0.804688, 0.585938], true, -0.22],
    [[1, 0, 1, 0], true, -1],
    [[0.183594, 0.449219, 0.550781, 0.816406], false, -0.27],
    [[0, 1, 0, 1], false, -1],
    [[0.425781, 0.191406, 0.808594, 0.574219], false, 0.23],
    [[1, 0, 1, 0], false, 1],
  ] as [CurveCoefficients, boolean, number][])(
    "reads %j (rising: %s) as %s",
    (coefficients, rising, amount) => {
      expect(coefficientsToCurve(coefficients, rising)).toBe(amount);
    },
  );

  it("reads a curve off Live's family as the nearest amount", () => {
    expect(coefficientsToCurve([0.4, 0.2, 0.8, 0.6], true)).toBe(-0.2);
  });

  it("gets every hundredth back through the editor's 1/256 rounding", () => {
    for (const rising of [true, false]) {
      for (let hundredths = -100; hundredths <= 100; hundredths += 1) {
        const amount = hundredths / 100;
        const stored = quantize(curveToCoefficients(amount, rising));

        expect(coefficientsToCurve(stored, rising)).toBe(amount);
      }
    }
  });
});
