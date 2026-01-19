import { describe, expect, it } from "vitest";
import { parseBeatsPerBar } from "./barbeat-time.js";

describe("parseBeatsPerBar", () => {
  describe("default behavior", () => {
    it("returns DEFAULT_BEATS_PER_BAR (4) when no options provided", () => {
      expect(parseBeatsPerBar()).toBe(4);
    });

    it("returns DEFAULT_BEATS_PER_BAR (4) when empty options provided", () => {
      expect(parseBeatsPerBar({})).toBe(4);
    });
  });

  describe("beatsPerBar option (legacy)", () => {
    it("uses beatsPerBar when provided", () => {
      expect(parseBeatsPerBar({ beatsPerBar: 3 })).toBe(3);
    });

    it("uses beatsPerBar when provided with value 6", () => {
      expect(parseBeatsPerBar({ beatsPerBar: 6 })).toBe(6);
    });
  });

  describe("time signature options", () => {
    it("uses timeSigNumerator when both numerator and denominator provided", () => {
      expect(
        parseBeatsPerBar({ timeSigNumerator: 3, timeSigDenominator: 4 }),
      ).toBe(3);
    });

    it("uses timeSigNumerator for 6/8 time", () => {
      expect(
        parseBeatsPerBar({ timeSigNumerator: 6, timeSigDenominator: 8 }),
      ).toBe(6);
    });

    it("uses timeSigNumerator for 5/4 time", () => {
      expect(
        parseBeatsPerBar({ timeSigNumerator: 5, timeSigDenominator: 4 }),
      ).toBe(5);
    });

    it("timeSigNumerator takes priority over beatsPerBar", () => {
      expect(
        parseBeatsPerBar({
          beatsPerBar: 4,
          timeSigNumerator: 3,
          timeSigDenominator: 4,
        }),
      ).toBe(3);
    });
  });

  describe("validation errors", () => {
    it("throws when only timeSigNumerator is provided", () => {
      expect(() => parseBeatsPerBar({ timeSigNumerator: 3 })).toThrow(
        "Time signature must be specified with both numerator and denominator",
      );
    });

    it("throws when only timeSigDenominator is provided", () => {
      expect(() => parseBeatsPerBar({ timeSigDenominator: 4 })).toThrow(
        "Time signature must be specified with both numerator and denominator",
      );
    });

    it("throws when timeSigNumerator provided but timeSigDenominator is null", () => {
      expect(() =>
        parseBeatsPerBar({
          timeSigNumerator: 3,
          timeSigDenominator: null as unknown as number,
        }),
      ).toThrow(
        "Time signature must be specified with both numerator and denominator",
      );
    });

    it("throws when timeSigDenominator provided but timeSigNumerator is null", () => {
      expect(() =>
        parseBeatsPerBar({
          timeSigNumerator: null as unknown as number,
          timeSigDenominator: 4,
        }),
      ).toThrow(
        "Time signature must be specified with both numerator and denominator",
      );
    });
  });

  describe("priority order", () => {
    it("timeSigNumerator > beatsPerBar > DEFAULT_BEATS_PER_BAR", () => {
      // All provided - timeSigNumerator wins
      expect(
        parseBeatsPerBar({
          beatsPerBar: 6,
          timeSigNumerator: 3,
          timeSigDenominator: 4,
        }),
      ).toBe(3);

      // Only beatsPerBar - beatsPerBar wins
      expect(parseBeatsPerBar({ beatsPerBar: 6 })).toBe(6);

      // Neither - default wins
      expect(parseBeatsPerBar({})).toBe(4);
    });
  });
});
