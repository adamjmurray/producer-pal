// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { evaluateTransform } from "#src/notation/transform/transform-evaluator.ts";

const CTX = { position: 0, timeSig: { numerator: 4, denominator: 4 } };

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
