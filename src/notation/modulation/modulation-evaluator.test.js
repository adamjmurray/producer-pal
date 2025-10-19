import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { evaluateModulation } from "./modulation-evaluator.js";

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
      const result = evaluateModulation(null, {
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
      expect(result.velocity.value).toBe(15);
    });

    it("evaluates subtraction", () => {
      const result = evaluateModulation("velocity += 10 - 5", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(5);
    });

    it("evaluates multiplication", () => {
      const result = evaluateModulation("velocity += 10 * 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(20);
    });

    it("evaluates division", () => {
      const result = evaluateModulation("velocity += 10 / 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(5);
    });

    it("handles division by zero (returns 0)", () => {
      const result = evaluateModulation("velocity += 10 / 0", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(0);
    });

    it("respects operator precedence", () => {
      const result = evaluateModulation("velocity += 10 + 5 * 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(20); // 10 + (5 * 2)
    });

    it("handles parentheses", () => {
      const result = evaluateModulation("velocity += (10 + 5) * 2", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(30);
    });
  });

  describe("cosine waveform", () => {
    it("evaluates cos at position 0 (starts at peak)", () => {
      const result = evaluateModulation("velocity += cos(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(1.0, 10);
    });

    it("evaluates cos at position 0.25 (quarter period)", () => {
      const result = evaluateModulation("velocity += cos(1t)", {
        position: 0.25,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates cos at position 0.5 (half period)", () => {
      const result = evaluateModulation("velocity += cos(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates cos with phase offset", () => {
      const result = evaluateModulation("velocity += cos(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      // Phase 0 + offset 0.5 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates cos with bar:beat frequency (1:0t in 4/4 = 4 beats)", () => {
      const result = evaluateModulation("velocity += cos(1:0t)", {
        position: 2, // halfway through 4-beat period
        timeSig: { numerator: 4, denominator: 4 },
      });
      // position 2 / period 4 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates scaled cosine", () => {
      const result = evaluateModulation("velocity += 20 * cos(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(20.0, 10);
    });
  });

  describe("triangle waveform", () => {
    it("evaluates tri at position 0 (starts at peak)", () => {
      const result = evaluateModulation("velocity += tri(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(1.0);
    });

    it("evaluates tri at position 0.25 (quarter period)", () => {
      const result = evaluateModulation("velocity += tri(1t)", {
        position: 0.25,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates tri at position 0.5 (half period)", () => {
      const result = evaluateModulation("velocity += tri(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(-1.0);
    });

    it("evaluates tri with phase offset", () => {
      const result = evaluateModulation("velocity += tri(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(-1.0);
    });
  });

  describe("sawtooth waveform", () => {
    it("evaluates saw at position 0 (starts at peak)", () => {
      const result = evaluateModulation("velocity += saw(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(1.0);
    });

    it("evaluates saw at position 0.5 (half period)", () => {
      const result = evaluateModulation("velocity += saw(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(0.0, 10);
    });

    it("evaluates saw with phase offset", () => {
      const result = evaluateModulation("velocity += saw(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(0.0, 10);
    });
  });

  describe("square waveform", () => {
    it("evaluates square at position 0 (starts high)", () => {
      const result = evaluateModulation("velocity += square(1t)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(1.0);
    });

    it("evaluates square at position 0.5 (switches to low)", () => {
      const result = evaluateModulation("velocity += square(1t)", {
        position: 0.5,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(-1.0);
    });

    it("evaluates square with custom pulse width", () => {
      const result = evaluateModulation("velocity += square(1t, 0, 0.25)", {
        position: 0.3, // past 25% duty cycle
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(-1.0);
    });

    it("evaluates square with phase offset", () => {
      const result = evaluateModulation("velocity += square(1t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      // Phase 0 + offset 0.5 = phase 0.5 → square switches at 0.5
      expect(result.velocity.value).toBe(-1.0);
    });
  });

  describe("noise waveform", () => {
    it("evaluates noise within range", () => {
      for (let i = 0; i < 10; i++) {
        const result = evaluateModulation("velocity += noise()", {
          position: i,
          timeSig: { numerator: 4, denominator: 4 },
        });
        expect(result.velocity.value).toBeGreaterThanOrEqual(-1.0);
        expect(result.velocity.value).toBeLessThanOrEqual(1.0);
      }
    });

    it("evaluates scaled noise", () => {
      const result = evaluateModulation("velocity += 10 * noise()", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeGreaterThanOrEqual(-10.0);
      expect(result.velocity.value).toBeLessThanOrEqual(10.0);
    });
  });

  describe("complex expressions", () => {
    it("evaluates unipolar envelope (20 + 20 * cos)", () => {
      const result = evaluateModulation("velocity += 20 + 20 * cos(1:0t)", {
        position: 0, // cos at position 0 = 1.0
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(40.0, 10); // 20 + 20 * 1.0
    });

    it("evaluates swing timing (0.05 * (cos(1t) - 1))", () => {
      const result = evaluateModulation("timing += 0.05 * (cos(1t) - 1)", {
        position: 0, // cos at position 0 = 1.0
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.timing.value).toBeCloseTo(0.0, 10); // 0.05 * (1.0 - 1) = 0
    });

    it("evaluates multiple functions combined", () => {
      const result = evaluateModulation("velocity += 20 * cos(1t) + 10", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(30.0, 10); // 20 * 1.0 + 10
    });

    it("evaluates amplitude modulation (cos * cos)", () => {
      const result = evaluateModulation(
        "velocity += 30 * cos(4:0t) * cos(1t)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
      );
      expect(result.velocity.value).toBeCloseTo(30.0, 10); // 30 * 1.0 * 1.0
    });
  });

  describe("time signatures", () => {
    it("evaluates modulation in 3/4", () => {
      const result = evaluateModulation("velocity += cos(1:0t)", {
        position: 1.5, // halfway through 3-beat bar
        timeSig: { numerator: 3, denominator: 4 },
      });
      // position 1.5 / period 3 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity.value).toBeCloseTo(-1.0, 10);
    });

    it("evaluates modulation in 6/8", () => {
      const result = evaluateModulation("velocity += cos(1:0t)", {
        position: 3, // halfway through 6-beat bar
        timeSig: { numerator: 6, denominator: 8 },
      });
      // position 3 / period 6 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity.value).toBeCloseTo(-1.0, 10);
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
      expect(result.velocity.value).toBeCloseTo(20.0, 10);
      expect(result.timing.value).toBeGreaterThanOrEqual(-0.05);
      expect(result.timing.value).toBeLessThanOrEqual(0.05);
      expect(result.probability.value).toBeCloseTo(0.2, 10);
    });
  });

  describe("error handling", () => {
    let consoleErrorSpy;

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
      expect(result.timing.value).toBe(0.05);
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
      expect(result.velocity.value).toBeCloseTo(20.0, 10);
    });

    it("phase-shifted: velocity += 20 * cos(1:0t, 0.5)", () => {
      const result = evaluateModulation("velocity += 20 * cos(1:0t, 0.5)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBeCloseTo(-20.0, 10);
    });

    it("pulse width modulation: velocity += 20 * square(2t, 0, 0.25)", () => {
      const result = evaluateModulation(
        "velocity += 20 * square(2t, 0, 0.25)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
      );
      expect(result.velocity.value).toBe(20.0);
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
      expect(result.velocity.value).toBeGreaterThanOrEqual(10.0);
      expect(result.velocity.value).toBeLessThanOrEqual(30.0);
    });
  });

  describe("pitch filtering", () => {
    it("applies modulation to matching pitch", () => {
      const result = evaluateModulation("60 velocity += 10", {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(10);
    });

    it("skips modulation for non-matching pitch", () => {
      const result = evaluateModulation("60 velocity += 10", {
        position: 0,
        pitch: 61,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result).toStrictEqual({});
    });

    it("applies modulation when no pitch specified", () => {
      const result = evaluateModulation("velocity += 10", {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(10);
    });

    it("persists pitch across multiple lines", () => {
      const result = evaluateModulation("60 velocity += 10\ntiming += 0.05", {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(10);
      expect(result.timing.value).toBe(0.05);
    });

    it("resets pitch when specified again", () => {
      const modString = `60 velocity += 10
61 velocity += 20`;
      const result1 = evaluateModulation(modString, {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result1.velocity.value).toBe(10);

      const result2 = evaluateModulation(modString, {
        position: 0,
        pitch: 61,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result2.velocity.value).toBe(20);
    });
  });

  describe("time range filtering", () => {
    it("applies modulation within time range", () => {
      const result = evaluateModulation("1|1-2|1 velocity += 10", {
        position: 0,
        bar: 1,
        beat: 2,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(10);
    });

    it("skips modulation outside time range (before)", () => {
      const result = evaluateModulation("2|1-3|1 velocity += 10", {
        position: 0,
        bar: 1,
        beat: 4,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result).toStrictEqual({});
    });

    it("skips modulation outside time range (after)", () => {
      const result = evaluateModulation("1|1-2|1 velocity += 10", {
        position: 0,
        bar: 3,
        beat: 1,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result).toStrictEqual({});
    });

    it("applies at range boundaries", () => {
      const modString = "1|1-2|4 velocity += 10";

      const atStart = evaluateModulation(modString, {
        position: 0,
        bar: 1,
        beat: 1,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(atStart.velocity.value).toBe(10);

      const atEnd = evaluateModulation(modString, {
        position: 0,
        bar: 2,
        beat: 4,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(atEnd.velocity.value).toBe(10);
    });
  });

  describe("combined pitch and time filtering", () => {
    it("applies when both pitch and time match", () => {
      const result = evaluateModulation("60 1|1-2|1 velocity += 10", {
        position: 0,
        pitch: 60,
        bar: 1,
        beat: 2,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(10);
    });

    it("skips when pitch matches but time doesn't", () => {
      const result = evaluateModulation("60 1|1-2|1 velocity += 10", {
        position: 0,
        pitch: 60,
        bar: 3,
        beat: 1,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result).toStrictEqual({});
    });

    it("skips when time matches but pitch doesn't", () => {
      const result = evaluateModulation("60 1|1-2|1 velocity += 10", {
        position: 0,
        pitch: 61,
        bar: 1,
        beat: 2,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result).toStrictEqual({});
    });
  });

  describe("operators", () => {
    it("returns add operator for += syntax", () => {
      const result = evaluateModulation("velocity += 10", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.operator).toBe("add");
    });

    it("returns set operator for = syntax", () => {
      const result = evaluateModulation("velocity = 64", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.operator).toBe("set");
    });
  });
});
