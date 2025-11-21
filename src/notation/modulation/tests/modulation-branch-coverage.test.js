import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { evaluateModulation } from "../modulation-evaluator.js";
import { evaluateModulationAST } from "../modulation-evaluator-helpers.js";
import * as console from "../../shared/v8-max-console.js";
import * as barBeatTime from "../../barbeat/time/barbeat-time.js";

describe("Modulation Branch Coverage", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("modulation-evaluator.js branch coverage", () => {
    it("handles malformed bar|beat string from abletonBeatsToBarBeat", () => {
      // Mock abletonBeatsToBarBeat to return malformed string
      vi.spyOn(barBeatTime, "abletonBeatsToBarBeat").mockReturnValue(
        "malformed",
      );

      const result = evaluateModulation(
        "velocity += 50",
        {
          position: 0,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { pitch: 60, velocity: 100 },
      );

      // Should still work, just bar and beat will be null
      expect(result.velocity).toBeDefined();
      expect(result.velocity.value).toBe(50);
    });

    it("handles empty bar|beat string from abletonBeatsToBarBeat", () => {
      vi.spyOn(barBeatTime, "abletonBeatsToBarBeat").mockReturnValue("");

      const result = evaluateModulation(
        "velocity += 30",
        {
          position: 2,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { pitch: 60, velocity: 100 },
      );

      // Should still work despite malformed bar|beat
      expect(result.velocity).toBeDefined();
      expect(result.velocity.value).toBe(30);
    });
  });

  describe("modulation-functions.js branch coverage", () => {
    it("handles ramp with zero time range duration (end = start)", () => {
      // When timeRange.end === timeRange.start, duration is 0, phase should default to 0
      const result = evaluateModulation(
        "velocity += ramp(0, 100)",
        {
          position: 5,
          timeSig: { numerator: 4, denominator: 4 },
          clipTimeRange: { start: 5, end: 5 }, // Zero duration
        },
        { pitch: 60, velocity: 100 },
      );

      // Should work despite zero duration
      expect(result.velocity).toBeDefined();
      expect(typeof result.velocity.value).toBe("number");
    });

    it("handles ramp with negative time range duration (end < start)", () => {
      // When timeRange.end < timeRange.start, duration is negative, phase should default to 0
      const result = evaluateModulation(
        "velocity += ramp(20, 80)",
        {
          position: 3,
          timeSig: { numerator: 4, denominator: 4 },
          clipTimeRange: { start: 10, end: 2 }, // Negative duration
        },
        { pitch: 60, velocity: 100 },
      );

      // Should work despite negative duration
      expect(result.velocity).toBeDefined();
      expect(typeof result.velocity.value).toBe("number");
    });

    it("handles ramp with zero duration and speed parameter", () => {
      const result = evaluateModulation(
        "velocity += ramp(0, 100, 2)",
        {
          position: 7,
          timeSig: { numerator: 4, denominator: 4 },
          clipTimeRange: { start: 7, end: 7 }, // Zero duration
        },
        { pitch: 60, velocity: 100 },
      );

      // Should handle gracefully with phase = 0
      expect(result.velocity).toBeDefined();
      expect(typeof result.velocity.value).toBe("number");
    });
  });

  describe("modulation-evaluator-helpers.js branch coverage", () => {
    it("handles assignment with pitch range that filters out the note", () => {
      // When a note is outside the pitch range, assignment is skipped
      // and assignmentResult.value will be null/undefined
      const ast = [
        {
          parameter: "velocity",
          operator: "set",
          pitchRange: { startPitch: 70, endPitch: 80 }, // Range: C5 to G#5
          expression: { type: "number", value: 127 },
        },
      ];

      const result = evaluateModulationAST(
        ast,
        {
          position: 0,
          pitch: 60, // C4 - outside the range
          timeSig: { numerator: 4, denominator: 4 },
        },
        { pitch: 60 },
      );

      // Assignment should be skipped, result should not have velocity
      expect(result.velocity).toBeUndefined();
    });

    it("handles assignment with time range that filters out the note", () => {
      // When a note is outside the time range, assignment is skipped
      const ast = [
        {
          parameter: "velocity",
          operator: "set",
          timeRange: {
            startBar: 2,
            startBeat: 1,
            endBar: 3,
            endBeat: 1,
          },
          expression: { type: "number", value: 127 },
        },
      ];

      const result = evaluateModulationAST(
        ast,
        {
          position: 0,
          bar: 1, // Before the time range starts
          beat: 1,
          timeSig: { numerator: 4, denominator: 4 },
        },
        { pitch: 60 },
      );

      // Assignment should be skipped
      expect(result.velocity).toBeUndefined();
    });

    it("handles assignment that skips due to pitch filtering", () => {
      // This tests the branch where assignmentResult.value is null
      // because the assignment was skipped and continues to next iteration
      const ast = [
        {
          parameter: "velocity",
          operator: "set",
          pitchRange: { startPitch: 70, endPitch: 80 },
          expression: { type: "number", value: 127 },
        },
      ];

      const result = evaluateModulationAST(
        ast,
        {
          position: 0,
          pitch: 60, // Outside the pitch range
          timeSig: { numerator: 4, denominator: 4 },
        },
        { pitch: 60 },
      );

      // Assignment was skipped, so velocity should not be in result
      expect(result.velocity).toBeUndefined();
      expect(Object.keys(result).length).toBe(0);
    });
  });
});
