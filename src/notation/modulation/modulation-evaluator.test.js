import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  evaluateModulation,
  applyModulations,
} from "./modulation-evaluator.js";

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

  describe("ramp waveform", () => {
    it("evaluates ramp at position 0 (starts at start value)", () => {
      const result = evaluateModulation("velocity += ramp(0, 1)", {
        position: 0,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });
      expect(result.velocity.value).toBe(0);
    });

    it("evaluates ramp at position 2 (halfway through clip)", () => {
      const result = evaluateModulation("velocity += ramp(0, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });
      expect(result.velocity.value).toBe(0.5);
    });

    it("evaluates ramp at position 4 (end of clip, wraps to start)", () => {
      const result = evaluateModulation("velocity += ramp(0, 1)", {
        position: 4,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });
      // Phase 1.0 wraps to 0.0 due to modulo in waveform
      expect(result.velocity.value).toBe(0);
    });

    it("evaluates reverse ramp", () => {
      const result = evaluateModulation("velocity += ramp(1, 0)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });
      expect(result.velocity.value).toBe(0.5);
    });

    it("evaluates ramp with speed = 2", () => {
      const result = evaluateModulation("velocity += ramp(0, 1, 2)", {
        position: 1,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });
      // position 1 out of 4 beats = phase 0.25 * speed 2 = phase 0.5
      expect(result.velocity.value).toBe(0.5);
    });

    it("evaluates scaled ramp", () => {
      const result = evaluateModulation("velocity += 20 * ramp(0, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });
      expect(result.velocity.value).toBe(10); // 20 * 0.5
    });

    it("evaluates ramp with arbitrary range", () => {
      const result = evaluateModulation("velocity += ramp(-1, 1)", {
        position: 2,
        timeSig: { numerator: 4, denominator: 4 },
        clipTimeRange: { start: 0, end: 4 },
      });
      expect(result.velocity.value).toBe(0); // -1 + 2 * 0.5
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
      const result = evaluateModulation("C3 velocity += 10", {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(10);
    });

    it("skips modulation for non-matching pitch", () => {
      const result = evaluateModulation("C3 velocity += 10", {
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
      const result = evaluateModulation("C3 velocity += 10\ntiming += 0.05", {
        position: 0,
        pitch: 60,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(10);
      expect(result.timing.value).toBe(0.05);
    });

    it("resets pitch when specified again", () => {
      const modString = `C3 velocity += 10
C#3 velocity += 20`;
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
      const result = evaluateModulation("C3 1|1-2|1 velocity += 10", {
        position: 0,
        pitch: 60,
        bar: 1,
        beat: 2,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result.velocity.value).toBe(10);
    });

    it("skips when pitch matches but time doesn't", () => {
      const result = evaluateModulation("C3 1|1-2|1 velocity += 10", {
        position: 0,
        pitch: 60,
        bar: 3,
        beat: 1,
        timeSig: { numerator: 4, denominator: 4 },
      });
      expect(result).toStrictEqual({});
    });

    it("skips when time matches but pitch doesn't", () => {
      const result = evaluateModulation("C3 1|1-2|1 velocity += 10", {
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

  describe("note property variables", () => {
    const noteProps = {
      pitch: 60,
      start: 2.5,
      velocity: 100,
      velocityDeviation: 10,
      duration: 0.5,
      probability: 0.8,
    };

    it("evaluates note.pitch variable", () => {
      const result = evaluateModulation(
        "velocity += note.pitch",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(60);
    });

    it("evaluates note.start variable", () => {
      const result = evaluateModulation(
        "velocity += note.start * 10",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(25);
    });

    it("evaluates note.velocity variable", () => {
      const result = evaluateModulation(
        "duration += note.velocity / 100",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.duration.value).toBe(1);
    });

    it("evaluates note.velocityDeviation variable", () => {
      const result = evaluateModulation(
        "velocity += note.velocityDeviation",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(10);
    });

    it("evaluates note.duration variable", () => {
      const result = evaluateModulation(
        "probability += note.duration",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.probability.value).toBe(0.5);
    });

    it("evaluates note.probability variable", () => {
      const result = evaluateModulation(
        "velocity += note.probability * 20",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(16);
    });

    it("allows self-reference: velocity based on note.velocity", () => {
      const result = evaluateModulation(
        "velocity = note.velocity / 2",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(50);
    });

    it("combines variables in arithmetic expressions", () => {
      const result = evaluateModulation(
        "velocity += note.pitch + note.velocityDeviation",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(70);
    });

    it("uses variables with functions", () => {
      const result = evaluateModulation(
        "velocity += note.velocity * cos(1t)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBeCloseTo(100, 5);
    });

    it("uses variables in complex expressions", () => {
      const result = evaluateModulation(
        "velocity = (note.pitch / 127) * 100",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBeCloseTo(47.24, 2);
    });

    it("uses multiple variables in same expression", () => {
      const result = evaluateModulation(
        "duration = note.duration * note.probability",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.duration.value).toBe(0.4);
    });

    it("uses variables in parenthesized expressions", () => {
      const result = evaluateModulation(
        "velocity = (note.pitch + note.velocityDeviation) * 2",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(140);
    });

    it("uses variables with pitch filtering", () => {
      const result = evaluateModulation(
        "C3 velocity = note.velocity / 2",
        {
          position: 0,
          pitch: 60,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(50);
    });

    it("uses variables with time range filtering", () => {
      const result = evaluateModulation(
        "1|1-2|1 velocity = note.pitch",
        {
          position: 0,
          bar: 1,
          beat: 2,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(60);
    });

    it("throws error for undefined variable", () => {
      const result = evaluateModulation(
        "velocity += note.invalid",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        {},
      );
      // Should skip the parameter due to error
      expect(result).toStrictEqual({});
    });

    it("handles variables in ramp function arguments", () => {
      const result = evaluateModulation(
        "velocity = ramp(0, note.velocity)",
        {
          position: 2,
          timeSig: { numerator: 4, denominator: 4 },
          clipTimeRange: { start: 0, end: 4 },
        },
        noteProps,
      );
      expect(result.velocity.value).toBe(50); // ramp at 0.5 phase
    });

    it("handles variables in waveform phase offset", () => {
      const result = evaluateModulation(
        "velocity += cos(1t, note.probability)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      // cos(phase 0 + offset 0.8)
      expect(result.velocity.value).toBeCloseTo(Math.cos(2 * Math.PI * 0.8), 5);
    });

    it("uses variable as waveform period", () => {
      const result = evaluateModulation(
        "velocity += cos(note.duration)",
        {
          position: 0.25, // quarter way through period
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      // noteProps.duration = 0.5, so position 0.25 / period 0.5 = phase 0.5
      // cos(0.5) = -1
      expect(result.velocity.value).toBeCloseTo(-1.0, 5);
    });

    it("uses expression as waveform period", () => {
      const result = evaluateModulation(
        "velocity += cos(note.duration * 2)",
        {
          position: 0.5, // halfway through period
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      // noteProps.duration * 2 = 0.5 * 2 = 1.0
      // position 0.5 / period 1.0 = phase 0.5 → cos(0.5) = -1
      expect(result.velocity.value).toBeCloseTo(-1.0, 5);
    });

    it("throws error when variable period is <= 0", () => {
      const result = evaluateModulation(
        "velocity += cos(note.duration - 0.5)",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        noteProps,
      );
      // noteProps.duration - 0.5 = 0.5 - 0.5 = 0, should error
      expect(result).toStrictEqual({});
    });
  });
});

describe("applyModulations", () => {
  describe("basic functionality", () => {
    it("does nothing with null modulation string", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, null, 4, 4);
      expect(notes[0].velocity).toBe(100);
    });

    it("does nothing with empty modulation string", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "", 4, 4);
      expect(notes[0].velocity).toBe(100);
    });

    it("does nothing with empty notes array", () => {
      const notes = [];
      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes).toStrictEqual([]);
    });

    it("applies simple velocity modulation with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes[0].velocity).toBe(110);
    });

    it("applies simple velocity modulation with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity = 64", 4, 4);
      expect(notes[0].velocity).toBe(64);
    });

    it("modifies notes in-place", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      const originalNotes = notes;
      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes).toBe(originalNotes);
    });
  });

  describe("range clamping", () => {
    it("clamps velocity to minimum 1 with += operator", () => {
      const notes = [
        { pitch: 60, start_time: 0, duration: 1, velocity: 10, probability: 1 },
      ];
      applyModulations(notes, "velocity += -100", 4, 4);
      expect(notes[0].velocity).toBe(1);
    });

    it("clamps velocity to maximum 127 with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity += 100", 4, 4);
      expect(notes[0].velocity).toBe(127);
    });

    it("clamps velocity to minimum 1 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity = 0", 4, 4);
      expect(notes[0].velocity).toBe(1);
    });

    it("clamps velocity to maximum 127 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity = 200", 4, 4);
      expect(notes[0].velocity).toBe(127);
    });

    it("clamps duration to minimum 0.001 with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 0.1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "duration += -1", 4, 4);
      expect(notes[0].duration).toBe(0.001);
    });

    it("clamps duration to minimum 0.001 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "duration = -1", 4, 4);
      expect(notes[0].duration).toBe(0.001);
    });

    it("clamps probability to minimum 0.0 with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 0.5,
        },
      ];
      applyModulations(notes, "probability += -1", 4, 4);
      expect(notes[0].probability).toBe(0.0);
    });

    it("clamps probability to maximum 1.0 with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 0.5,
        },
      ];
      applyModulations(notes, "probability += 1", 4, 4);
      expect(notes[0].probability).toBe(1.0);
    });

    it("clamps probability to minimum 0.0 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "probability = -0.5", 4, 4);
      expect(notes[0].probability).toBe(0.0);
    });

    it("clamps probability to maximum 1.0 with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "probability = 2.0", 4, 4);
      expect(notes[0].probability).toBe(1.0);
    });

    it("modifies timing without clamping with += operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "timing += 0.5", 4, 4);
      expect(notes[0].start_time).toBe(2.5);
    });

    it("sets timing without clamping with = operator", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 2,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "timing = 5", 4, 4);
      expect(notes[0].start_time).toBe(5);
    });
  });

  describe("multi-parameter modulation", () => {
    it("applies multiple modulations to same note", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      const modString = `velocity += 10
timing += 0.05
duration += 0.5
probability += -0.2`;
      applyModulations(notes, modString, 4, 4);
      expect(notes[0].velocity).toBe(110);
      expect(notes[0].start_time).toBe(0.05);
      expect(notes[0].duration).toBe(1.5);
      expect(notes[0].probability).toBe(0.8);
    });

    it("applies modulations to multiple notes", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        { pitch: 64, start_time: 1, duration: 1, velocity: 80, probability: 1 },
        { pitch: 67, start_time: 2, duration: 1, velocity: 90, probability: 1 },
      ];
      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes[0].velocity).toBe(110);
      expect(notes[1].velocity).toBe(90);
      expect(notes[2].velocity).toBe(100);
    });
  });

  describe("time signature handling", () => {
    it("handles 4/4 time signature", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      // In 4/4, 1 Ableton beat = 1 musical beat, so cos(1t) at position 0 = 1
      applyModulations(notes, "velocity += 20 * cos(1t)", 4, 4);
      expect(notes[0].velocity).toBeCloseTo(120, 5);
    });

    it("handles 3/4 time signature", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      // In 3/4, 1 Ableton beat = 1 musical beat
      applyModulations(notes, "velocity += 20 * cos(1t)", 3, 4);
      expect(notes[0].velocity).toBeCloseTo(120, 5);
    });

    it("handles 6/8 time signature", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      // In 6/8, 1 Ableton beat = 2 musical beats (denominator/4 = 8/4 = 2)
      applyModulations(notes, "velocity += 20 * cos(1t)", 6, 8);
      expect(notes[0].velocity).toBeCloseTo(120, 5);
    });

    it("correctly calculates musical beats for different positions in 4/4", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        {
          pitch: 60,
          start_time: 0.5,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        {
          pitch: 60,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      // cos(1t) completes one cycle per beat: 0→1, 0.5→-1, 1→1
      applyModulations(notes, "velocity += 20 * cos(1t)", 4, 4);
      expect(notes[0].velocity).toBeCloseTo(120, 5); // cos(0) = 1
      expect(notes[1].velocity).toBeCloseTo(80, 5); // cos(0.5) ≈ -1
      expect(notes[2].velocity).toBeCloseTo(120, 5); // cos(1) = 1
    });
  });

  describe("pitch filtering", () => {
    it("applies modulation only to matching pitch", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        {
          pitch: 64,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "C3 velocity += 20", 4, 4);
      expect(notes[0].velocity).toBe(120);
      expect(notes[1].velocity).toBe(100); // unchanged
    });

    it("applies modulation to all pitches when no filter specified", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
        {
          pitch: 64,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity += 20", 4, 4);
      expect(notes[0].velocity).toBe(120);
      expect(notes[1].velocity).toBe(120);
    });
  });

  describe("time range filtering", () => {
    it("applies modulation only within time range", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
        }, // bar 1, beat 1
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1,
        }, // bar 2, beat 1
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1,
        }, // bar 3, beat 1
      ];
      applyModulations(notes, "1|1-2|4 velocity += 20", 4, 4);
      expect(notes[0].velocity).toBe(120); // in range
      expect(notes[1].velocity).toBe(120); // in range
      expect(notes[2].velocity).toBe(100); // out of range
    });
  });

  describe("edge cases", () => {
    it("handles notes with velocity at lower boundary", () => {
      const notes = [
        { pitch: 60, start_time: 0, duration: 1, velocity: 1, probability: 1 },
      ];
      applyModulations(notes, "velocity += -10", 4, 4);
      expect(notes[0].velocity).toBe(1);
    });

    it("handles notes with velocity at upper boundary", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 127,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity += 10", 4, 4);
      expect(notes[0].velocity).toBe(127);
    });

    it("handles notes with very small duration", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 0.001,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "duration += -0.01", 4, 4);
      expect(notes[0].duration).toBe(0.001);
    });

    it("handles notes with probability at boundaries", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 0,
        },
        {
          pitch: 64,
          start_time: 1,
          duration: 1,
          velocity: 100,
          probability: 1,
        },
      ];
      applyModulations(notes, "probability += 0.5", 4, 4);
      expect(notes[0].probability).toBe(0.5);
      expect(notes[1].probability).toBe(1.0); // clamped
    });
  });

  describe("note property variables", () => {
    it("applies modulation using note.pitch variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
        {
          pitch: 72,
          start_time: 1,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity = note.pitch", 4, 4);
      expect(notes[0].velocity).toBe(60);
      expect(notes[1].velocity).toBe(72);
    });

    it("applies modulation using note.velocity variable (self-reference)", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity = note.velocity / 2", 4, 4);
      expect(notes[0].velocity).toBe(50);
    });

    it("applies modulation using note.velocityDeviation variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 20,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity += note.velocityDeviation", 4, 4);
      expect(notes[0].velocity).toBe(120);
    });

    it("applies modulation using note.duration variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];
      applyModulations(notes, "probability = note.duration", 4, 4);
      expect(notes[0].probability).toBe(0.5);
    });

    it("applies modulation using note.probability variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 0.5,
        },
      ];
      applyModulations(notes, "velocity = note.probability * 127", 4, 4);
      expect(notes[0].velocity).toBeCloseTo(63.5, 1);
    });

    it("applies modulation using note.start variable", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
        {
          pitch: 60,
          start_time: 1,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];
      // In 4/4, start_time 0 = 0 beats, start_time 1 = 1 beat
      applyModulations(notes, "velocity = 64 + note.start * 10", 4, 4);
      expect(notes[0].velocity).toBe(64); // 64 + 0 * 10
      expect(notes[1].velocity).toBe(74); // 64 + 1 * 10
    });

    it("applies different modulations to different notes based on their properties", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 0.25,
          velocity: 80,
          velocity_deviation: 0,
          probability: 1,
        },
        {
          pitch: 72,
          start_time: 1,
          duration: 0.5,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];
      applyModulations(
        notes,
        "velocity = note.pitch + note.duration * 20",
        4,
        4,
      );
      expect(notes[0].velocity).toBe(65); // 60 + 0.25 * 20
      expect(notes[1].velocity).toBe(82); // 72 + 0.5 * 20
    });

    it("combines note variables with waveforms", () => {
      const notes = [
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          velocity_deviation: 0,
          probability: 1,
        },
      ];
      applyModulations(notes, "velocity = note.velocity * cos(1t)", 4, 4);
      expect(notes[0].velocity).toBeCloseTo(100, 5); // 100 * cos(0) = 100 * 1
    });
  });
});
