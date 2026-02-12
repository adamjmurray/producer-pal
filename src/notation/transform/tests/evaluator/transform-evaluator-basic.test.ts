// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { evaluateTransform } from "#src/notation/transform/transform-evaluator.ts";

describe("Transform Evaluator", () => {
  describe("basic structure", () => {
    it("returns empty object for empty string", () => {
      const result = evaluateTransform("", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("returns empty object for null/undefined", () => {
      const result = evaluateTransform(null as unknown as string, {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("evaluates single parameter", () => {
      const result = evaluateTransform("velocity += 10", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({
        velocity: { operator: "add", value: 10 },
      });
    });

    it("evaluates multiple parameters", () => {
      const result = evaluateTransform("velocity += 10\ntiming += 0.05", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({
        velocity: { operator: "add", value: 10 },
        timing: { operator: "add", value: 0.05 },
      });
    });
  });

  describe("arithmetic operations", () => {
    it("evaluates addition", () => {
      const result = evaluateTransform("velocity += 10 + 5", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(15);
    });

    it("evaluates subtraction", () => {
      const result = evaluateTransform("velocity += 10 - 5", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(5);
    });

    it("evaluates multiplication", () => {
      const result = evaluateTransform("velocity += 10 * 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(20);
    });

    it("evaluates division", () => {
      const result = evaluateTransform("velocity += 10 / 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(5);
    });

    it("handles division by zero (returns 0)", () => {
      const result = evaluateTransform("velocity += 10 / 0", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(0);
    });

    it("respects operator precedence", () => {
      const result = evaluateTransform("velocity += 10 + 5 * 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(20); // 10 + (5 * 2)
    });

    it("handles parentheses", () => {
      const result = evaluateTransform("velocity += (10 + 5) * 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(30);
    });
  });

  describe("cosine waveform", () => {
    it("evaluates cos at position 0 (starts at peak)", () => {
      const result = evaluateTransform("velocity += cos(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(1.0, 10);
    });

    it("evaluates cos at position 0.25 (quarter period)", () => {
      const result = evaluateTransform("velocity += cos(1t)", {
        position: 0.25,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates cos at position 0.5 (half period)", () => {
      const result = evaluateTransform("velocity += cos(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates cos with phase offset", () => {
      const result = evaluateTransform("velocity += cos(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // Phase 0 + offset 0.5 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates cos with bar:beat frequency (1:0t in 4/4 = 4 beats)", () => {
      const result = evaluateTransform("velocity += cos(1:0t)", {
        position: 2, // halfway through 4-beat period
        timeSig: { numerator: 4, denominator: 4 },
      });

      // position 2 / period 4 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates scaled cosine", () => {
      const result = evaluateTransform("velocity += 20 * cos(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(20.0, 10);
    });
  });

  describe("sine waveform", () => {
    it("evaluates sin at position 0 (starts at zero)", () => {
      const result = evaluateTransform("velocity += sin(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates sin at position 0.25 (quarter period = peak)", () => {
      const result = evaluateTransform("velocity += sin(1t)", {
        position: 0.25,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(1.0, 10);
    });

    it("evaluates sin at position 0.5 (half period)", () => {
      const result = evaluateTransform("velocity += sin(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates sin with phase offset", () => {
      const result = evaluateTransform("velocity += sin(1t, 0.25)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // Phase 0 + offset 0.25 = phase 0.25 → sin(0.25) = 1.0
      expect(result.velocity!.value).toBeCloseTo(1.0, 10);
    });
  });

  describe("triangle waveform", () => {
    it("evaluates tri at position 0 (starts at zero)", () => {
      const result = evaluateTransform("velocity += tri(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(0.0);
    });

    it("evaluates tri at position 0.25 (quarter period = peak)", () => {
      const result = evaluateTransform("velocity += tri(1t)", {
        position: 0.25,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(1.0);
    });

    it("evaluates tri at position 0.5 (half period)", () => {
      const result = evaluateTransform("velocity += tri(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates tri with phase offset", () => {
      const result = evaluateTransform("velocity += tri(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // Phase 0 + offset 0.5 = phase 0.5 → tri(0.5) = 0.0
      expect(result.velocity!.value).toBeCloseTo(0.0, 10);
    });
  });

  describe("sawtooth waveform", () => {
    it("evaluates saw at position 0 (starts at zero)", () => {
      const result = evaluateTransform("velocity += saw(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(0.0);
    });

    it("evaluates saw at position 0.25 (quarter period)", () => {
      const result = evaluateTransform("velocity += saw(1t)", {
        position: 0.25,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.5, 10);
    });

    it("evaluates saw at position 0.5 (half period = discontinuity)", () => {
      const result = evaluateTransform("velocity += saw(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(-1.0);
    });

    it("evaluates saw with phase offset", () => {
      const result = evaluateTransform("velocity += saw(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // Phase 0 + offset 0.5 = phase 0.5 → saw(0.5) = -1.0
      expect(result.velocity!.value).toBe(-1.0);
    });
  });

  describe("square waveform", () => {
    it("evaluates square at position 0 (starts high)", () => {
      const result = evaluateTransform("velocity += square(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(1.0);
    });

    it("evaluates square at position 0.5 (switches to low)", () => {
      const result = evaluateTransform("velocity += square(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(-1.0);
    });

    it("evaluates square with custom pulse width", () => {
      const result = evaluateTransform("velocity += square(1t, 0, 0.25)", {
        position: 0.3, // past 25% duty cycle
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(-1.0);
    });

    it("evaluates square with phase offset", () => {
      const result = evaluateTransform("velocity += square(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // Phase 0 + offset 0.5 = phase 0.5 → square switches at 0.5
      expect(result.velocity!.value).toBe(-1.0);
    });
  });

  describe("rand function", () => {
    it("evaluates rand() with no args within [-1, 1]", () => {
      for (let i = 0; i < 10; i++) {
        const result = evaluateTransform("velocity += rand()", {
          position: i,
          timeSig: { numerator: 4, denominator: 4 },
        });

        expect(result.velocity!.value).toBeGreaterThanOrEqual(-1.0);
        expect(result.velocity!.value).toBeLessThanOrEqual(1.0);
      }
    });

    it("evaluates rand(10) within [0, 10]", () => {
      for (let i = 0; i < 10; i++) {
        const result = evaluateTransform("velocity += rand(10)", {
          position: i,
          timeSig: { numerator: 4, denominator: 4 },
        });

        expect(result.velocity!.value).toBeGreaterThanOrEqual(0);
        expect(result.velocity!.value).toBeLessThanOrEqual(10);
      }
    });

    it("evaluates rand(-5, 5) within [-5, 5]", () => {
      for (let i = 0; i < 10; i++) {
        const result = evaluateTransform("velocity += rand(-5, 5)", {
          position: i,
          timeSig: { numerator: 4, denominator: 4 },
        });

        expect(result.velocity!.value).toBeGreaterThanOrEqual(-5);
        expect(result.velocity!.value).toBeLessThanOrEqual(5);
      }
    });

    it("evaluates scaled rand", () => {
      const result = evaluateTransform("velocity += 10 * rand()", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeGreaterThanOrEqual(-10.0);
      expect(result.velocity!.value).toBeLessThanOrEqual(10.0);
    });
  });

  describe("choose function", () => {
    it("evaluates choose with single value", () => {
      const result = evaluateTransform("velocity += choose(42)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(42);
    });

    it("evaluates choose returning one of provided values", () => {
      const options = [60, 80, 100];

      for (let i = 0; i < 20; i++) {
        const result = evaluateTransform("velocity = choose(60, 80, 100)", {
          position: i,
          timeSig: { numerator: 4, denominator: 4 },
        });

        expect(options).toContain(result.velocity!.value);
      }
    });
  });

  describe("curve function", () => {
    it("evaluates curve at start of range (returns start)", () => {
      const result = evaluateTransform("velocity += curve(0, 1, 2)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(0);
    });

    it("evaluates curve with exponent=1 (linear, like ramp)", () => {
      const result = evaluateTransform("velocity += curve(0, 1, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.5, 10);
    });

    it("evaluates curve with exponent=2 (slow start)", () => {
      const result = evaluateTransform("velocity += curve(0, 1, 2)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      // phase 0.5^2 = 0.25
      expect(result.velocity!.value).toBeCloseTo(0.25, 10);
    });

    it("evaluates curve with exponent=0.5 (fast start)", () => {
      const result = evaluateTransform("velocity += curve(0, 1, 0.5)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      // phase 0.5^0.5 = sqrt(0.5) ≈ 0.707
      expect(result.velocity!.value).toBeCloseTo(Math.sqrt(0.5), 10);
    });

    it("skips curve with missing arguments", () => {
      const result = evaluateTransform("velocity += curve(0, 1)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result).toStrictEqual({});
    });
  });

  describe("ramp waveform", () => {
    it("evaluates ramp at position 0 (starts at start value)", () => {
      const result = evaluateTransform("velocity += ramp(0, 1)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(0);
    });

    it("evaluates ramp at position 2 (halfway through clip)", () => {
      const result = evaluateTransform("velocity += ramp(0, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(0.5);
    });

    it("evaluates ramp at position 4 (end of clip, wraps to start)", () => {
      const result = evaluateTransform("velocity += ramp(0, 1)", {
        position: 4,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      // Phase 1.0 wraps to 0.0 due to modulo in waveform
      expect(result.velocity!.value).toBe(0);
    });

    it("evaluates reverse ramp", () => {
      const result = evaluateTransform("velocity += ramp(1, 0)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(0.5);
    });

    it("evaluates ramp with speed = 2", () => {
      const result = evaluateTransform("velocity += ramp(0, 1, 2)", {
        position: 1,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      // position 1 out of 4 beats = phase 0.25 * speed 2 = phase 0.5
      expect(result.velocity!.value).toBe(0.5);
    });

    it("evaluates scaled ramp", () => {
      const result = evaluateTransform("velocity += 20 * ramp(0, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(10); // 20 * 0.5
    });

    it("evaluates ramp with arbitrary range", () => {
      const result = evaluateTransform("velocity += ramp(-1, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(0); // -1 + 2 * 0.5
    });

    it("throws error when start argument is missing", () => {
      const result = evaluateTransform("velocity += ramp()", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("throws error when end argument is missing", () => {
      const result = evaluateTransform("velocity += ramp(0)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("throws error when speed is <= 0", () => {
      const result = evaluateTransform("velocity += ramp(0, 1, 0)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("throws error when speed is negative", () => {
      const result = evaluateTransform("velocity += ramp(0, 1, -1)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result).toStrictEqual({});
    });
  });

  describe("complex expressions", () => {
    it("evaluates unipolar envelope (20 + 20 * cos)", () => {
      const result = evaluateTransform("velocity += 20 + 20 * cos(1:0t)", {
        position: 0, // cos at position 0 = 1.0
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(40.0, 10); // 20 + 20 * 1.0
    });

    it("evaluates swing timing (0.05 * (cos(1t) - 1))", () => {
      const result = evaluateTransform("timing += 0.05 * (cos(1t) - 1)", {
        position: 0, // cos at position 0 = 1.0
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.timing!.value).toBeCloseTo(0.0, 10); // 0.05 * (1.0 - 1) = 0
    });

    it("evaluates multiple functions combined", () => {
      const result = evaluateTransform("velocity += 20 * cos(1t) + 10", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(30.0, 10); // 20 * 1.0 + 10
    });

    it("evaluates amplitude transform (cos * cos)", () => {
      const result = evaluateTransform("velocity += 30 * cos(4:0t) * cos(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(30.0, 10); // 30 * 1.0 * 1.0
    });
  });

  describe("time signatures", () => {
    it("evaluates transform in 3/4", () => {
      const result = evaluateTransform("velocity += cos(1:0t)", {
        position: 1.5, // halfway through 3-beat bar
        timeSig: { numerator: 3, denominator: 4 },
      });

      // position 1.5 / period 3 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates transform in 6/8", () => {
      const result = evaluateTransform("velocity += cos(1:0t)", {
        position: 3, // halfway through 6-beat bar
        timeSig: { numerator: 6, denominator: 8 },
      });

      // position 3 / period 6 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });
  });

  describe("multi-parameter transform", () => {
    it("evaluates multiple parameters independently", () => {
      const modString = `velocity += 20 * cos(1:0t)
timing += 0.05 * rand()
probability += 0.2 * cos(0:2t)`;

      const result = evaluateTransform(modString, {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toHaveProperty("velocity");
      expect(result).toHaveProperty("timing");
      expect(result).toHaveProperty("probability");
      expect(result.velocity!.value).toBeCloseTo(20.0, 10);
      expect(result.timing!.value).toBeGreaterThanOrEqual(-0.05);
      expect(result.timing!.value).toBeLessThanOrEqual(0.05);
      expect(result.probability!.value).toBeCloseTo(0.2, 10);
    });
  });

  describe("error handling", () => {
    it("returns empty object on parse error", () => {
      const result = evaluateTransform("invalid syntax!!!", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Transform parse error"),
      );
    });

    it("skips parameter with evaluation error but continues with others", () => {
      // Use an expression that will cause evaluation error (cos without frequency)
      const modString = `velocity += cos()
timing += 0.05`;

      const result = evaluateTransform(modString, {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // velocity should be skipped due to error, but timing should work
      expect(result).not.toHaveProperty("velocity");
      expect(result.timing!.value).toBe(0.05);
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("Failed to evaluate transform"),
      );
    });

    it("handles missing frequency argument", () => {
      const result = evaluateTransform("velocity += cos()", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
      expect(outlet).toHaveBeenCalledWith(1, expect.anything());
    });
  });

  describe("real-world examples from spec", () => {
    it("basic envelope: velocity += 20 * cos(1:0t)", () => {
      const result = evaluateTransform("velocity += 20 * cos(1:0t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(20.0, 10);
    });

    it("phase-shifted: velocity += 20 * cos(1:0t, 0.5)", () => {
      const result = evaluateTransform("velocity += 20 * cos(1:0t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(-20.0, 10);
    });

    it("pulse width transform: velocity += 20 * square(2t, 0, 0.25)", () => {
      const result = evaluateTransform("velocity += 20 * square(2t, 0, 0.25)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(20.0);
    });

    it("combined functions: velocity += 20 * cos(4:0t) + 10 * rand()", () => {
      const result = evaluateTransform(
        "velocity += 20 * cos(4:0t) + 10 * rand()",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
      );

      // cos(0) = 1, so 20 * 1 + 10 * rand() should be between 10 and 30
      expect(result.velocity!.value).toBeGreaterThanOrEqual(10.0);
      expect(result.velocity!.value).toBeLessThanOrEqual(30.0);
    });
  });
});
