// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { evaluateTransform } from "#src/notation/transform/transform-evaluator.ts";

const CTX = { position: 0, timeSig: { numerator: 4, denominator: 4 } };

/**
 * Asserts that `velocity = <expr>` evaluates to the expected value.
 * @param expr - The expression to evaluate
 * @param expected - The expected velocity value
 */
function expectVelocityEquals(expr: string, expected: number) {
  const result = evaluateTransform(`velocity = ${expr}`, CTX);

  expect(result.velocity!.value).toBe(expected);
}

describe("Transform Evaluator - Math Functions", () => {
  describe("round", () => {
    it.each([
      ["10.7", 11, "positive up"],
      ["10.3", 10, "positive down"],
      ["10.5", 11, "midpoint (0.5) up"],
      ["-2.7", -3, "negative"],
    ])("rounds %s to %d (%s)", (input, expected) => {
      const result = evaluateTransform(`velocity = round(${input})`, CTX);

      expect(result.velocity!.value).toBe(expected);
    });

    it("rounds expression with variable", () => {
      const result = evaluateTransform(
        "velocity = round(note.velocity / 10)",
        CTX,
        { velocity: 67 },
      );

      expect(result.velocity!.value).toBe(7);
    });
  });

  describe("floor", () => {
    it.each([
      ["10.9", 10, "positive decimal"],
      ["-2.3", -3, "negative (toward -infinity)"],
    ])("floors %s to %d (%s)", (input, expected) => {
      const result = evaluateTransform(`velocity = floor(${input})`, CTX);

      expect(result.velocity!.value).toBe(expected);
    });
  });

  describe("abs", () => {
    it.each([
      ["-50", 50, "negative"],
      ["50", 50, "positive unchanged"],
      ["0", 0, "zero"],
    ])("abs(%s) = %d (%s)", (input, expected) => {
      const result = evaluateTransform(`velocity = abs(${input})`, CTX);

      expect(result.velocity!.value).toBe(expected);
    });
  });

  describe("min", () => {
    it.each([
      ["min(100, 60)", 60, "two values"],
      ["min(100, 60, 80)", 60, "three values"],
    ])("%s = %d (%s)", (expr, expected) => {
      const result = evaluateTransform(`velocity = ${expr}`, CTX);

      expect(result.velocity!.value).toBe(expected);
    });
  });

  describe("max", () => {
    it.each([
      ["max(40, 60)", 60, "two values"],
      ["max(10, 50, 30, 20)", 50, "four values"],
    ])("%s = %d (%s)", (expr, expected) => {
      const result = evaluateTransform(`velocity = ${expr}`, CTX);

      expect(result.velocity!.value).toBe(expected);
    });

    it("clamps velocity with variable", () => {
      const result = evaluateTransform(
        "velocity = max(60, note.velocity)",
        CTX,
        { velocity: 40 },
      );

      expect(result.velocity!.value).toBe(60);
    });
  });

  describe("ceil", () => {
    it.each([
      ["10.1", 11, "positive decimal"],
      ["-2.7", -2, "negative (toward +infinity)"],
      ["5", 5, "integer unchanged"],
    ])("ceil(%s) = %d (%s)", (input, expected) => {
      const result = evaluateTransform(`velocity = ceil(${input})`, CTX);

      expect(result.velocity!.value).toBe(expected);
    });
  });

  describe("clamp", () => {
    it.each([
      ["clamp(50, 0, 100)", 50, "within range"],
      ["clamp(-10, 0, 100)", 0, "below min"],
      ["clamp(150, 0, 100)", 100, "above max"],
      ["clamp(50, 100, 0)", 50, "swapped bounds"],
      ["clamp(50, 50, 50)", 50, "equal bounds"],
    ])("%s = %d (%s)", (expr, expected) => {
      expectVelocityEquals(expr, expected);
    });

    it("clamps variable to range", () => {
      const result = evaluateTransform(
        "velocity = clamp(note.velocity, 40, 100)",
        CTX,
        { velocity: 20 },
      );

      expect(result.velocity!.value).toBe(40);
    });
  });

  describe("wrap", () => {
    it.each([
      ["wrap(64, 48, 72)", 64, "within range"],
      ["wrap(48, 48, 72)", 48, "at lower bound"],
      ["wrap(72, 48, 72)", 72, "at upper bound"],
      ["wrap(73, 48, 72)", 48, "one above max wraps to min"],
      ["wrap(47, 48, 72)", 72, "one below min wraps to max"],
      ["wrap(98, 48, 72)", 48 + ((98 - 48) % 25), "multiple wraps forward"],
      ["wrap(60, 72, 48)", 60, "swapped bounds"],
      ["wrap(60, 60, 60)", 60, "equal bounds"],
    ])("%s = %d (%s)", (expr, expected) => {
      expectVelocityEquals(expr, expected);
    });

    it("wraps pitch with variable", () => {
      const result = evaluateTransform(
        "pitch = wrap(note.pitch + 5, 48, 72)",
        CTX,
        { pitch: 70 },
      );

      // 70 + 5 = 75, range = 25, (75 - 48) % 25 = 2, 2 + 48 = 50
      expect(result.pitch!.value).toBe(50);
    });
  });

  describe("reflect", () => {
    it.each([
      ["reflect(60, 48, 72)", 60, "within range"],
      ["reflect(48, 48, 72)", 48, "at lower bound"],
      ["reflect(72, 48, 72)", 72, "at upper bound"],
      ["reflect(73, 48, 72)", 71, "one above max reflects back"],
      ["reflect(47, 48, 72)", 49, "one below min reflects back"],
      ["reflect(96, 48, 72)", 48, "reflects to lower bound"],
      ["reflect(97, 48, 72)", 49, "reflects past lower bound"],
      ["reflect(24, 48, 72)", 72, "reflects to upper bound"],
      ["reflect(60, 72, 48)", 60, "swapped bounds"],
      ["reflect(60, 60, 60)", 60, "equal bounds"],
    ])("%s = %d (%s)", (expr, expected) => {
      const result = evaluateTransform(`velocity = ${expr}`, CTX);

      expect(result.velocity!.value).toBe(expected);
    });

    it("reflects pitch with variable", () => {
      const result = evaluateTransform(
        "pitch = reflect(note.pitch + 5, 48, 72)",
        CTX,
        { pitch: 70 },
      );

      // 70 + 5 = 75, period = 48, (75 - 48) = 27, 27 > 24, 48 - 27 = 21, 21 + 48 = 69
      expect(result.pitch!.value).toBe(69);
    });
  });

  describe("pow", () => {
    it.each([
      ["pow(2, 3)", 8, "basic power"],
      ["pow(9, 0.5)", 3, "square root"],
      ["pow(2, 0)", 1, "zero exponent"],
    ])("%s = %d (%s)", (expr, expected) => {
      const result = evaluateTransform(`velocity = ${expr}`, CTX);

      expect(result.velocity!.value).toBe(expected);
    });

    it("works with expressions", () => {
      const result = evaluateTransform(
        "velocity = pow(note.velocity, 2)",
        CTX,
        { velocity: 3 },
      );

      expect(result.velocity!.value).toBe(9);
    });
  });

  describe("nested functions", () => {
    it("round(12 * rand()) returns integer in range", () => {
      for (let i = 0; i < 10; i++) {
        const result = evaluateTransform("pitch += round(12 * rand())", {
          position: i,
          timeSig: { numerator: 4, denominator: 4 },
        });

        expect(Number.isInteger(result.pitch!.value)).toBe(true);
        expect(result.pitch!.value).toBeGreaterThanOrEqual(-12);
        expect(result.pitch!.value).toBeLessThanOrEqual(12);
      }
    });
  });
});

describe("Transform Evaluator - Modulo Operator", () => {
  it.each([
    ["10 % 3", 1, "basic modulo"],
    ["-1 % 4", 3, "wraparound for negative dividend"],
    ["7 % -3", -2, "wraparound for negative divisor"],
    ["10 % 0", 0, "modulo by zero returns 0"],
    ["10 + 7 % 3", 11, "precedence with addition"],
  ])("evaluates %s = %d (%s)", (expr, expected) => {
    const result = evaluateTransform(`velocity += ${expr}`, CTX);

    expect(result.velocity!.value).toBe(expected);
  });

  it("alternating pattern with index", () => {
    const result0 = evaluateTransform("gain = -6 * (0 % 2)", CTX);
    const result1 = evaluateTransform("gain = -6 * (1 % 2)", CTX);

    // Add 0 to convert -0 to 0 for strict equality
    expect(result0.gain!.value + 0).toBe(0);
    expect(result1.gain!.value).toBe(-6);
  });
});

const CTX_6_8 = { position: 0, timeSig: { numerator: 6, denominator: 8 } };
const CTX_3_2 = { position: 0, timeSig: { numerator: 3, denominator: 2 } };
const CTX_3_4 = { position: 0, timeSig: { numerator: 3, denominator: 4 } };

describe("Transform Evaluator - nDuration", () => {
  describe("in 4/4 (musical beats = quarter beats)", () => {
    it.each([
      ["n/4", 1, "quarter = 1 beat"],
      ["n/8", 0.5, "eighth = 0.5 beats"],
      ["n/16", 0.25, "sixteenth = 0.25 beats"],
      ["n/2", 2, "half = 2 beats"],
      ["n/1", 4, "whole = 4 beats"],
      ["n3/8", 1.5, "dotted quarter = 1.5 beats"],
    ])("duration = %s → %d (%s)", (expr, expected) => {
      const result = evaluateTransform(`duration = ${expr}`, CTX);

      expect(result.duration!.value).toBe(expected);
    });

    it("triplet n/12 evaluates to 1/3", () => {
      const result = evaluateTransform("duration = n/12", CTX);

      expect(result.duration!.value).toBeCloseTo(1 / 3, 10);
    });
  });

  describe("in 6/8 (musical beats = eighth notes)", () => {
    it.each([
      ["n/4", 2, "quarter = 2 eighths"],
      ["n/8", 1, "eighth = 1 musical beat"],
      ["n/16", 0.5, "sixteenth = 0.5 musical beats"],
      ["n/2", 4, "half = 4 eighths"],
      ["n3/8", 3, "dotted quarter = 3 eighths"],
    ])("duration = %s → %d (%s)", (expr, expected) => {
      const result = evaluateTransform(`duration = ${expr}`, CTX_6_8);

      expect(result.duration!.value).toBe(expected);
    });
  });

  describe("in 3/2 (musical beats = half notes)", () => {
    it.each([
      ["n/4", 0.5, "quarter = 0.5 half-notes"],
      ["n/2", 1, "half = 1 musical beat"],
      ["n/1", 2, "whole = 2 half-notes"],
      ["n/8", 0.25, "eighth = 0.25 half-notes"],
    ])("duration = %s → %d (%s)", (expr, expected) => {
      const result = evaluateTransform(`duration = ${expr}`, CTX_3_2);

      expect(result.duration!.value).toBe(expected);
    });
  });

  describe("in 3/4 (musical beats = quarter notes)", () => {
    it("n/4 = 1 musical beat", () => {
      const result = evaluateTransform("duration = n/4", CTX_3_4);

      expect(result.duration!.value).toBe(1);
    });
  });

  describe("composes with arithmetic", () => {
    it("n/4 + n/8 in 4/4 → 1.5", () => {
      const result = evaluateTransform("duration = n/4 + n/8", CTX);

      expect(result.duration!.value).toBe(1.5);
    });

    it("2 * n/8 in 4/4 → 1", () => {
      const result = evaluateTransform("duration = 2 * n/8", CTX);

      expect(result.duration!.value).toBe(1);
    });

    it("n/4 - n/16 in 4/4 → 0.75", () => {
      const result = evaluateTransform("duration = n/4 - n/16", CTX);

      expect(result.duration!.value).toBe(0.75);
    });

    it("(n/4 + n/8) * 2 in 4/4 → 3", () => {
      const result = evaluateTransform("duration = (n/4 + n/8) * 2", CTX);

      expect(result.duration!.value).toBe(3);
    });
  });

  describe("composes with variables (musical-beat semantics)", () => {
    it("duration = note.duration + n/8 in 4/4: 1 + 0.5 = 1.5", () => {
      const result = evaluateTransform("duration = note.duration + n/8", CTX, {
        duration: 1,
      });

      expect(result.duration!.value).toBe(1.5);
    });

    it("duration += n/16 in 4/4 adds 0.25 musical beats", () => {
      const result = evaluateTransform("duration += n/16", CTX);

      expect(result.duration!.value).toBe(0.25);
    });
  });

  describe("works with timing parameter", () => {
    it("timing = n/16 in 4/4 → 0.25", () => {
      const result = evaluateTransform("timing = n/16", CTX);

      expect(result.timing!.value).toBe(0.25);
    });
  });
});
