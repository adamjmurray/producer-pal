import type { MockInstance } from "vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { evaluateModulation } from "#src/notation/modulation/modulation-evaluator.ts";

describe("Modulation Evaluator", () => {
  describe("basic structure", () => {
    it("returns empty object for empty string", () => {
      const result = evaluateModulation("", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("returns empty object for null/undefined", () => {
      const result = evaluateModulation(null as unknown as string, {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("evaluates single parameter", () => {
      const result = evaluateModulation("velocity += 10", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({
        velocity: { operator: "add", value: 10 },
      });
    });

    it("evaluates multiple parameters", () => {
      const result = evaluateModulation("velocity += 10\ntiming += 0.05", {
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
      const result = evaluateModulation("velocity += 10 + 5", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(15);
    });

    it("evaluates subtraction", () => {
      const result = evaluateModulation("velocity += 10 - 5", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(5);
    });

    it("evaluates multiplication", () => {
      const result = evaluateModulation("velocity += 10 * 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(20);
    });

    it("evaluates division", () => {
      const result = evaluateModulation("velocity += 10 / 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(5);
    });

    it("handles division by zero (returns 0)", () => {
      const result = evaluateModulation("velocity += 10 / 0", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(0);
    });

    it("respects operator precedence", () => {
      const result = evaluateModulation("velocity += 10 + 5 * 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(20); // 10 + (5 * 2)
    });

    it("handles parentheses", () => {
      const result = evaluateModulation("velocity += (10 + 5) * 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(30);
    });
  });

  describe("cosine waveform", () => {
    it("evaluates cos at position 0 (starts at peak)", () => {
      const result = evaluateModulation("velocity += cos(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(1.0, 10);
    });

    it("evaluates cos at position 0.25 (quarter period)", () => {
      const result = evaluateModulation("velocity += cos(1t)", {
        position: 0.25,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates cos at position 0.5 (half period)", () => {
      const result = evaluateModulation("velocity += cos(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates cos with phase offset", () => {
      const result = evaluateModulation("velocity += cos(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // Phase 0 + offset 0.5 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates cos with bar:beat frequency (1:0t in 4/4 = 4 beats)", () => {
      const result = evaluateModulation("velocity += cos(1:0t)", {
        position: 2, // halfway through 4-beat period
        timeSig: { numerator: 4, denominator: 4 },
      });

      // position 2 / period 4 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates scaled cosine", () => {
      const result = evaluateModulation("velocity += 20 * cos(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(20.0, 10);
    });
  });

  describe("triangle waveform", () => {
    it("evaluates tri at position 0 (starts at peak)", () => {
      const result = evaluateModulation("velocity += tri(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(1.0);
    });

    it("evaluates tri at position 0.25 (quarter period)", () => {
      const result = evaluateModulation("velocity += tri(1t)", {
        position: 0.25,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates tri at position 0.5 (half period)", () => {
      const result = evaluateModulation("velocity += tri(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(-1.0);
    });

    it("evaluates tri with phase offset", () => {
      const result = evaluateModulation("velocity += tri(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(-1.0);
    });
  });

  describe("sawtooth waveform", () => {
    it("evaluates saw at position 0 (starts at peak)", () => {
      const result = evaluateModulation("velocity += saw(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(1.0);
    });

    it("evaluates saw at position 0.5 (half period)", () => {
      const result = evaluateModulation("velocity += saw(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates saw with phase offset", () => {
      const result = evaluateModulation("velocity += saw(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(0.0, 10);
    });
  });

  describe("square waveform", () => {
    it("evaluates square at position 0 (starts high)", () => {
      const result = evaluateModulation("velocity += square(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(1.0);
    });

    it("evaluates square at position 0.5 (switches to low)", () => {
      const result = evaluateModulation("velocity += square(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(-1.0);
    });

    it("evaluates square with custom pulse width", () => {
      const result = evaluateModulation("velocity += square(1t, 0, 0.25)", {
        position: 0.3, // past 25% duty cycle
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBe(-1.0);
    });

    it("evaluates square with phase offset", () => {
      const result = evaluateModulation("velocity += square(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // Phase 0 + offset 0.5 = phase 0.5 → square switches at 0.5
      expect(result.velocity!.value).toBe(-1.0);
    });
  });

  describe("noise waveform", () => {
    it("evaluates noise within range", () => {
      for (let i = 0; i < 10; i++) {
        const result = evaluateModulation("velocity += noise()", {
          position: i,
          timeSig: { numerator: 4, denominator: 4 },
        });

        expect(result.velocity!.value).toBeGreaterThanOrEqual(-1.0);
        expect(result.velocity!.value).toBeLessThanOrEqual(1.0);
      }
    });

    it("evaluates scaled noise", () => {
      const result = evaluateModulation("velocity += 10 * noise()", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeGreaterThanOrEqual(-10.0);
      expect(result.velocity!.value).toBeLessThanOrEqual(10.0);
    });
  });

  describe("ramp waveform", () => {
    it("evaluates ramp at position 0 (starts at start value)", () => {
      const result = evaluateModulation("velocity += ramp(0, 1)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(0);
    });

    it("evaluates ramp at position 2 (halfway through clip)", () => {
      const result = evaluateModulation("velocity += ramp(0, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(0.5);
    });

    it("evaluates ramp at position 4 (end of clip, wraps to start)", () => {
      const result = evaluateModulation("velocity += ramp(0, 1)", {
        position: 4,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      // Phase 1.0 wraps to 0.0 due to modulo in waveform
      expect(result.velocity!.value).toBe(0);
    });

    it("evaluates reverse ramp", () => {
      const result = evaluateModulation("velocity += ramp(1, 0)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(0.5);
    });

    it("evaluates ramp with speed = 2", () => {
      const result = evaluateModulation("velocity += ramp(0, 1, 2)", {
        position: 1,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      // position 1 out of 4 beats = phase 0.25 * speed 2 = phase 0.5
      expect(result.velocity!.value).toBe(0.5);
    });

    it("evaluates scaled ramp", () => {
      const result = evaluateModulation("velocity += 20 * ramp(0, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(10); // 20 * 0.5
    });

    it("evaluates ramp with arbitrary range", () => {
      const result = evaluateModulation("velocity += ramp(-1, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result.velocity!.value).toBe(0); // -1 + 2 * 0.5
    });

    it("throws error when start argument is missing", () => {
      const result = evaluateModulation("velocity += ramp()", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("throws error when end argument is missing", () => {
      const result = evaluateModulation("velocity += ramp(0)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("throws error when speed is <= 0", () => {
      const result = evaluateModulation("velocity += ramp(0, 1, 0)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result).toStrictEqual({});
    });

    it("throws error when speed is negative", () => {
      const result = evaluateModulation("velocity += ramp(0, 1, -1)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });

      expect(result).toStrictEqual({});
    });
  });

  describe("complex expressions", () => {
    it("evaluates unipolar envelope (20 + 20 * cos)", () => {
      const result = evaluateModulation("velocity += 20 + 20 * cos(1:0t)", {
        position: 0, // cos at position 0 = 1.0
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(40.0, 10); // 20 + 20 * 1.0
    });

    it("evaluates swing timing (0.05 * (cos(1t) - 1))", () => {
      const result = evaluateModulation("timing += 0.05 * (cos(1t) - 1)", {
        position: 0, // cos at position 0 = 1.0
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.timing!.value).toBeCloseTo(0.0, 10); // 0.05 * (1.0 - 1) = 0
    });

    it("evaluates multiple functions combined", () => {
      const result = evaluateModulation("velocity += 20 * cos(1t) + 10", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(30.0, 10); // 20 * 1.0 + 10
    });

    it("evaluates amplitude modulation (cos * cos)", () => {
      const result = evaluateModulation(
        "velocity += 30 * cos(4:0t) * cos(1t)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
      );

      expect(result.velocity!.value).toBeCloseTo(30.0, 10); // 30 * 1.0 * 1.0
    });
  });

  describe("time signatures", () => {
    it("evaluates modulation in 3/4", () => {
      const result = evaluateModulation("velocity += cos(1:0t)", {
        position: 1.5, // halfway through 3-beat bar
        timeSig: { numerator: 3, denominator: 4 },
      });

      // position 1.5 / period 3 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates modulation in 6/8", () => {
      const result = evaluateModulation("velocity += cos(1:0t)", {
        position: 3, // halfway through 6-beat bar
        timeSig: { numerator: 6, denominator: 8 },
      });

      // position 3 / period 6 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity!.value).toBeCloseTo(-1.0, 10);
    });
  });

  describe("multi-parameter modulation", () => {
    it("evaluates multiple parameters independently", () => {
      const modString = `velocity += 20 * cos(1:0t)
timing += 0.05 * noise()
probability += 0.2 * cos(0:2t)`;

      const result = evaluateModulation(modString, {
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
    let consoleErrorSpy: MockInstance;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("returns empty object on parse error", () => {
      const result = evaluateModulation("invalid syntax!!!", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Warning: Failed to parse"),
      );
    });

    it("skips parameter with evaluation error but continues with others", () => {
      // Use an expression that will cause evaluation error (cos without frequency)
      const modString = `velocity += cos()
timing += 0.05`;

      const result = evaluateModulation(modString, {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      // velocity should be skipped due to error, but timing should work
      expect(result).not.toHaveProperty("velocity");
      expect(result.timing!.value).toBe(0.05);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Warning: Failed to evaluate modulation"),
      );
    });

    it("handles missing frequency argument", () => {
      const result = evaluateModulation("velocity += cos()", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result).toStrictEqual({});
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe("real-world examples from spec", () => {
    it("basic envelope: velocity += 20 * cos(1:0t)", () => {
      const result = evaluateModulation("velocity += 20 * cos(1:0t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(20.0, 10);
    });

    it("phase-shifted: velocity += 20 * cos(1:0t, 0.5)", () => {
      const result = evaluateModulation("velocity += 20 * cos(1:0t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });

      expect(result.velocity!.value).toBeCloseTo(-20.0, 10);
    });

    it("pulse width modulation: velocity += 20 * square(2t, 0, 0.25)", () => {
      const result = evaluateModulation(
        "velocity += 20 * square(2t, 0, 0.25)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
      );

      expect(result.velocity!.value).toBe(20.0);
    });

    it("combined functions: velocity += 20 * cos(4:0t) + 10 * noise()", () => {
      const result = evaluateModulation(
        "velocity += 20 * cos(4:0t) + 10 * noise()",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
      );

      // cos(0) = 1, so 20 * 1 + 10 * noise() should be between 10 and 30
      expect(result.velocity!.value).toBeGreaterThanOrEqual(10.0);
      expect(result.velocity!.value).toBeLessThanOrEqual(30.0);
    });
  });
});
