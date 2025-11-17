import { describe, expect, it } from "vitest";
import { parseArrangementLength } from "./duplicate.js";

describe("duplicate - helper functions", () => {
  describe("parseArrangementLength", () => {
    it("parses valid bar:beat duration in 4/4 time", () => {
      const result = parseArrangementLength("2:0", 4, 4);
      expect(result).toBe(8); // 2 bars * 4 beats = 8 beats
    });

    it("parses valid bar:beat duration in 3/4 time", () => {
      const result = parseArrangementLength("2:0", 3, 4);
      expect(result).toBe(6); // 2 bars * 3 beats = 6 beats
    });

    it("parses fractional bar:beat duration", () => {
      const result = parseArrangementLength("1:2", 4, 4);
      expect(result).toBe(6); // 1 bar (4 beats) + 2 beats = 6 beats
    });

    it("throws error for invalid bar:beat format", () => {
      expect(() => parseArrangementLength("invalid", 4, 4)).toThrow(
        /Invalid duration format/,
      );
    });

    it("throws error for negative duration", () => {
      expect(() => parseArrangementLength("-1:0", 4, 4)).toThrow(
        /duplicate failed.*must be 0 or greater/,
      );
    });

    it("throws error for zero duration", () => {
      expect(() => parseArrangementLength("0:0", 4, 4)).toThrow(
        /duplicate failed.*arrangementLength must be positive/,
      );
    });

    it("throws error for negative beats in duration", () => {
      expect(() => parseArrangementLength("1:-1", 4, 4)).toThrow(
        /duplicate failed.*must be 0 or greater/,
      );
    });

    it("handles 6/8 time signature", () => {
      const result = parseArrangementLength("2:0", 6, 8);
      expect(result).toBe(6); // 2 bars * 3 beats (6/8 = 3 quarter notes per bar) = 6 beats
    });
  });

  // Note: calculateSceneLength is tested indirectly through the main duplicate function tests
  // Direct unit testing would require complex LiveAPI mocking that's better suited for integration tests
});
