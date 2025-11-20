import { describe, expect, it } from "vitest";
import { interpretNotation } from "./barbeat-interpreter.js";

describe("bar|beat interpretNotation() - bar copy range operations", () => {
  describe("range copy", () => {
    it("copies bar to range with @N-M= syntax (default source)", () => {
      const result = interpretNotation("C3 D3 1|1 @2-4=");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 8,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("copies bar to range with @N-M=P syntax (explicit source)", () => {
      const result = interpretNotation("C3 1|1 D3 2|1 @4-6=1");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 62,
          start_time: 4,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 12,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 16,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 20,
          duration: 1,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("preserves note properties in range copy", () => {
      const result = interpretNotation("v80 t0.5 p0.8 C3 1|1 @2-3=");
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 4,
          duration: 0.5,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 8,
          duration: 0.5,
          velocity: 80,
          probability: 0.8,
          velocity_deviation: 0,
        },
      ]);
    });
    it("handles range copy with different time signatures", () => {
      const result = interpretNotation("C3 1|1 @2-3=", {
        timeSigNumerator: 6,
        timeSigDenominator: 8,
      });
      expect(result).toEqual([
        {
          pitch: 60,
          start_time: 0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 3.0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
        {
          pitch: 60,
          start_time: 6.0,
          duration: 0.5,
          velocity: 100,
          probability: 1.0,
          velocity_deviation: 0,
        },
      ]);
    });
    it("can chain range copies with regular copies", () => {
      const result = interpretNotation("C3 1|1 @2-3= @5=1");
      expect(result).toHaveLength(4);
      expect(result).toContainEqual({
        pitch: 60,
        start_time: 0,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 60,
        start_time: 4,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 60,
        start_time: 8,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
      expect(result).toContainEqual({
        pitch: 60,
        start_time: 16,
        duration: 1,
        velocity: 100,
        probability: 1.0,
        velocity_deviation: 0,
      });
    });
  });
});
