import { describe, expect, it } from "vitest";
import {
  abletonBeatsToBarBeat,
  barBeatToAbletonBeats,
  barBeatToBeats,
  beatsToBarBeat,
} from "./barbeat-time.ts";

describe("barbeat-time utilities", () => {
  describe("beatsToBarBeat", () => {
    it("converts basic beat positions to bar|beat format", () => {
      expect(beatsToBarBeat(0, 4)).toBe("1|1");
      expect(beatsToBarBeat(1, 4)).toBe("1|2");
      expect(beatsToBarBeat(3, 4)).toBe("1|4");
      expect(beatsToBarBeat(4, 4)).toBe("2|1");
      expect(beatsToBarBeat(7, 4)).toBe("2|4");
      expect(beatsToBarBeat(8, 4)).toBe("3|1");
    });

    it("handles floating point beats", () => {
      expect(beatsToBarBeat(0.5, 4)).toBe("1|1.5");
      expect(beatsToBarBeat(1.25, 4)).toBe("1|2.25");
      expect(beatsToBarBeat(3.75, 4)).toBe("1|4.75");
      expect(beatsToBarBeat(4.5, 4)).toBe("2|1.5");
    });

    it("formats beats without unnecessary decimals", () => {
      expect(beatsToBarBeat(1.0, 4)).toBe("1|2");
      expect(beatsToBarBeat(1.1, 4)).toBe("1|2.1");
      expect(beatsToBarBeat(1.25, 4)).toBe("1|2.25");
      expect(beatsToBarBeat(1.0, 4)).toBe("1|2");
    });

    it("works with different time signatures", () => {
      // 3/4 time (3 beats per bar)
      expect(beatsToBarBeat(0, 3)).toBe("1|1");
      expect(beatsToBarBeat(2, 3)).toBe("1|3");
      expect(beatsToBarBeat(3, 3)).toBe("2|1");
      expect(beatsToBarBeat(5, 3)).toBe("2|3");

      // 6/8 time (6 beats per bar)
      expect(beatsToBarBeat(0, 6)).toBe("1|1");
      expect(beatsToBarBeat(5, 6)).toBe("1|6");
      expect(beatsToBarBeat(6, 6)).toBe("2|1");
      expect(beatsToBarBeat(11, 6)).toBe("2|6");
    });

    it("handles precise floating point formatting", () => {
      expect(beatsToBarBeat(0.333, 4)).toBe("1|1.333");
      expect(beatsToBarBeat(0.666667, 4)).toBe("1|1.667");
      expect(beatsToBarBeat(1.123456, 4)).toBe("1|2.123");
    });
  });

  describe("barBeatToBeats", () => {
    it("converts basic bar|beat format to beats", () => {
      expect(barBeatToBeats("1|1", 4)).toBe(0);
      expect(barBeatToBeats("1|2", 4)).toBe(1);
      expect(barBeatToBeats("1|4", 4)).toBe(3);
      expect(barBeatToBeats("2|1", 4)).toBe(4);
      expect(barBeatToBeats("2|4", 4)).toBe(7);
      expect(barBeatToBeats("3|1", 4)).toBe(8);
    });

    it("handles floating point beats", () => {
      expect(barBeatToBeats("1|1.5", 4)).toBe(0.5);
      expect(barBeatToBeats("1|2.25", 4)).toBe(1.25);
      expect(barBeatToBeats("1|4.75", 4)).toBe(3.75);
      expect(barBeatToBeats("2|1.5", 4)).toBe(4.5);
    });

    it("works with different time signatures", () => {
      // 3/4 time
      expect(barBeatToBeats("1|1", 3)).toBe(0);
      expect(barBeatToBeats("1|3", 3)).toBe(2);
      expect(barBeatToBeats("2|1", 3)).toBe(3);
      expect(barBeatToBeats("2|3", 3)).toBe(5);

      // 6/8 time
      expect(barBeatToBeats("1|1", 6)).toBe(0);
      expect(barBeatToBeats("1|6", 6)).toBe(5);
      expect(barBeatToBeats("2|1", 6)).toBe(6);
      expect(barBeatToBeats("2|6", 6)).toBe(11);
    });

    it("allows beats to overflow the bar", () => {
      expect(barBeatToBeats("1|5", 4)).toBe(4);
      expect(barBeatToBeats("1|10", 4)).toBe(9);
      expect(barBeatToBeats("1|10.5", 4)).toBe(9.5);
      expect(barBeatToBeats("2|10.5", 4)).toBe(13.5);
      expect(barBeatToBeats("1|10.5", 3)).toBe(9.5);
      expect(barBeatToBeats("2|10.5", 3)).toBe(12.5);
    });

    it("throws error for invalid format", () => {
      expect(() => barBeatToBeats("invalid", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("1", 4)).toThrow("Invalid bar|beat format");
      expect(() => barBeatToBeats("1:", 4)).toThrow("Invalid bar|beat format");
      expect(() => barBeatToBeats(":2", 4)).toThrow("Invalid bar|beat format");
      expect(() => barBeatToBeats("1|2:3", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("a:b", 4)).toThrow("Invalid bar|beat format");
    });

    it("throws error for bar number less than 1", () => {
      expect(() => barBeatToBeats("0|1", 4)).toThrow(
        "Bar number must be 1 or greater",
      );
      expect(() => barBeatToBeats("-1|1", 4)).toThrow(
        "Bar number must be 1 or greater",
      );
    });

    it("throws error for beat number less than 1", () => {
      expect(() => barBeatToBeats("1|0", 4)).toThrow(
        "Beat must be 1 or greater",
      );
      expect(() => barBeatToBeats("1|-1", 3)).toThrow(
        "Beat must be 1 or greater",
      );
    });

    it("handles fractional beat notation", () => {
      // Triplets in 4/4 (beat positions are 1-indexed, so 4/3 = 1 + 1/3)
      expect(barBeatToBeats("1|4/3", 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToBeats("1|5/3", 4)).toBeCloseTo(2 / 3, 10);
      expect(barBeatToBeats("1|7/3", 4)).toBeCloseTo(4 / 3, 10);

      // Dotted notes
      expect(barBeatToBeats("1|3/2", 4)).toBe(0.5);
      expect(barBeatToBeats("2|5/2", 4)).toBe(5.5);

      // Quintuplets
      expect(barBeatToBeats("1|6/5", 4)).toBeCloseTo(0.2, 10);
      expect(barBeatToBeats("1|7/5", 4)).toBeCloseTo(0.4, 10);
    });

    it("handles fractional beats in different time signatures", () => {
      // Triplets in 3/4
      expect(barBeatToBeats("1|4/3", 3)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToBeats("2|4/3", 3)).toBeCloseTo(3 + 1 / 3, 10);

      // Triplets in 6/8
      expect(barBeatToBeats("1|4/3", 6)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToBeats("1|7/3", 6)).toBeCloseTo(4 / 3, 10);
    });

    it("handles beats with + operator (integer + fraction)", () => {
      // Basic cases
      expect(barBeatToBeats("1|2+1/3", 4)).toBeCloseTo(4 / 3, 10);
      expect(barBeatToBeats("1|2+3/4", 4)).toBeCloseTo(1.75, 10);
      expect(barBeatToBeats("1|3+1/2", 4)).toBeCloseTo(2.5, 10);

      // Different bars
      expect(barBeatToBeats("2|1+1/4", 4)).toBeCloseTo(4.25, 10);
      expect(barBeatToBeats("3|2+2/3", 4)).toBeCloseTo(8 + 5 / 3, 10);

      // Different time signatures
      expect(barBeatToBeats("1|2+1/3", 3)).toBeCloseTo(4 / 3, 10);
      expect(barBeatToBeats("2|1+1/2", 6)).toBeCloseTo(6.5, 10);
    });

    it("throws error for fractional beats less than 1", () => {
      expect(() => barBeatToBeats("1|1/2", 4)).toThrow(
        "Beat must be 1 or greater",
      );
      expect(() => barBeatToBeats("1|2/3", 4)).toThrow(
        "Beat must be 1 or greater",
      );
      expect(() => barBeatToBeats("1|3/4", 4)).toThrow(
        "Beat must be 1 or greater",
      );
    });

    it("handles invalid fractional formats", () => {
      expect(() => barBeatToBeats("1|/3", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("1|4/", 4)).toThrow(
        "Invalid bar|beat format",
      );
      expect(() => barBeatToBeats("1|4/3/2", 4)).toThrow(
        "Invalid bar|beat format",
      );
    });
  });

  describe("abletonBeatsToBarBeat", () => {
    it("converts Ableton beats to bar|beat in 4/4 time", () => {
      // In 4/4, 1 Ableton beat = 1 musical beat
      expect(abletonBeatsToBarBeat(0, 4, 4)).toBe("1|1");
      expect(abletonBeatsToBarBeat(1, 4, 4)).toBe("1|2");
      expect(abletonBeatsToBarBeat(3, 4, 4)).toBe("1|4");
      expect(abletonBeatsToBarBeat(4, 4, 4)).toBe("2|1");
      expect(abletonBeatsToBarBeat(7.5, 4, 4)).toBe("2|4.5");
    });

    it("converts Ableton beats to bar|beat in 3/4 time", () => {
      // In 3/4, 1 Ableton beat = 1 musical beat
      expect(abletonBeatsToBarBeat(0, 3, 4)).toBe("1|1");
      expect(abletonBeatsToBarBeat(1, 3, 4)).toBe("1|2");
      expect(abletonBeatsToBarBeat(2, 3, 4)).toBe("1|3");
      expect(abletonBeatsToBarBeat(3, 3, 4)).toBe("2|1");
      expect(abletonBeatsToBarBeat(4.5, 3, 4)).toBe("2|2.5");
    });

    it("converts Ableton beats to bar|beat in 6/8 time", () => {
      // In 6/8, 1 Ableton beat = 2 musical beats (8th notes)
      expect(abletonBeatsToBarBeat(0, 6, 8)).toBe("1|1");
      expect(abletonBeatsToBarBeat(0.5, 6, 8)).toBe("1|2");
      expect(abletonBeatsToBarBeat(1, 6, 8)).toBe("1|3");
      expect(abletonBeatsToBarBeat(1.5, 6, 8)).toBe("1|4");
      expect(abletonBeatsToBarBeat(2.5, 6, 8)).toBe("1|6");
      expect(abletonBeatsToBarBeat(3, 6, 8)).toBe("2|1");
    });

    it("converts Ableton beats to bar|beat in 2/2 time", () => {
      // In 2/2, 1 Ableton beat = 0.5 musical beats (half notes)
      expect(abletonBeatsToBarBeat(0, 2, 2)).toBe("1|1");
      expect(abletonBeatsToBarBeat(2, 2, 2)).toBe("1|2");
      expect(abletonBeatsToBarBeat(4, 2, 2)).toBe("2|1");
      expect(abletonBeatsToBarBeat(6, 2, 2)).toBe("2|2");
    });

    it("converts Ableton beats to bar|beat in 9/8 time", () => {
      // In 9/8, 1 Ableton beat = 2 musical beats (8th notes)
      expect(abletonBeatsToBarBeat(0, 9, 8)).toBe("1|1");
      expect(abletonBeatsToBarBeat(0.5, 9, 8)).toBe("1|2");
      expect(abletonBeatsToBarBeat(2, 9, 8)).toBe("1|5");
      expect(abletonBeatsToBarBeat(4, 9, 8)).toBe("1|9");
      expect(abletonBeatsToBarBeat(4.5, 9, 8)).toBe("2|1");
    });

    it("converts Ableton beats to bar|beat in 12/16 time", () => {
      // In 12/16, 1 Ableton beat = 4 musical beats (16th notes)
      expect(abletonBeatsToBarBeat(0, 12, 16)).toBe("1|1");
      expect(abletonBeatsToBarBeat(0.25, 12, 16)).toBe("1|2");
      expect(abletonBeatsToBarBeat(0.5, 12, 16)).toBe("1|3");
      expect(abletonBeatsToBarBeat(2.75, 12, 16)).toBe("1|12");
      expect(abletonBeatsToBarBeat(3, 12, 16)).toBe("2|1");
    });

    it("handles floating point Ableton beats", () => {
      expect(abletonBeatsToBarBeat(0.5, 4, 4)).toBe("1|1.5");
      expect(abletonBeatsToBarBeat(1.25, 4, 4)).toBe("1|2.25");
      expect(abletonBeatsToBarBeat(0.25, 6, 8)).toBe("1|1.5");
      expect(abletonBeatsToBarBeat(0.75, 6, 8)).toBe("1|2.5");
    });
  });

  describe("barBeatToAbletonBeats", () => {
    it("converts bar|beat to Ableton beats in 4/4 time", () => {
      expect(barBeatToAbletonBeats("1|1", 4, 4)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 4, 4)).toBe(1);
      expect(barBeatToAbletonBeats("1|4", 4, 4)).toBe(3);
      expect(barBeatToAbletonBeats("2|1", 4, 4)).toBe(4);
      expect(barBeatToAbletonBeats("2|4.5", 4, 4)).toBe(7.5);
    });

    it("converts bar|beat to Ableton beats in 3/4 time", () => {
      expect(barBeatToAbletonBeats("1|1", 3, 4)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 3, 4)).toBe(1);
      expect(barBeatToAbletonBeats("1|3", 3, 4)).toBe(2);
      expect(barBeatToAbletonBeats("2|1", 3, 4)).toBe(3);
      expect(barBeatToAbletonBeats("2|2.5", 3, 4)).toBe(4.5);
    });

    it("converts bar|beat to Ableton beats in 6/8 time", () => {
      expect(barBeatToAbletonBeats("1|1", 6, 8)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 6, 8)).toBe(0.5);
      expect(barBeatToAbletonBeats("1|3", 6, 8)).toBe(1);
      expect(barBeatToAbletonBeats("1|4", 6, 8)).toBe(1.5);
      expect(barBeatToAbletonBeats("1|6", 6, 8)).toBe(2.5);
      expect(barBeatToAbletonBeats("2|1", 6, 8)).toBe(3);
    });

    it("converts bar|beat to Ableton beats in 2/2 time", () => {
      expect(barBeatToAbletonBeats("1|1", 2, 2)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 2, 2)).toBe(2);
      expect(barBeatToAbletonBeats("2|1", 2, 2)).toBe(4);
      expect(barBeatToAbletonBeats("2|2", 2, 2)).toBe(6);
    });

    it("converts bar|beat to Ableton beats in 9/8 time", () => {
      expect(barBeatToAbletonBeats("1|1", 9, 8)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 9, 8)).toBe(0.5);
      expect(barBeatToAbletonBeats("1|5", 9, 8)).toBe(2);
      expect(barBeatToAbletonBeats("1|9", 9, 8)).toBe(4);
      expect(barBeatToAbletonBeats("2|1", 9, 8)).toBe(4.5);
    });

    it("converts bar|beat to Ableton beats in 12/16 time", () => {
      expect(barBeatToAbletonBeats("1|1", 12, 16)).toBe(0);
      expect(barBeatToAbletonBeats("1|2", 12, 16)).toBe(0.25);
      expect(barBeatToAbletonBeats("1|3", 12, 16)).toBe(0.5);
      expect(barBeatToAbletonBeats("1|12", 12, 16)).toBe(2.75);
      expect(barBeatToAbletonBeats("2|1", 12, 16)).toBe(3);
    });

    it("handles floating point beats", () => {
      expect(barBeatToAbletonBeats("1|1.5", 4, 4)).toBe(0.5);
      expect(barBeatToAbletonBeats("1|2.25", 4, 4)).toBe(1.25);
      expect(barBeatToAbletonBeats("1|1.5", 6, 8)).toBe(0.25);
      expect(barBeatToAbletonBeats("1|2.5", 6, 8)).toBe(0.75);
    });

    it("converts fractional bar|beat notation to Ableton beats", () => {
      // Triplets in 4/4 (1 Ableton beat = 1 musical beat)
      expect(barBeatToAbletonBeats("1|4/3", 4, 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToAbletonBeats("1|5/3", 4, 4)).toBeCloseTo(2 / 3, 10);
      expect(barBeatToAbletonBeats("1|7/3", 4, 4)).toBeCloseTo(4 / 3, 10);

      // Triplets in 3/4
      expect(barBeatToAbletonBeats("1|4/3", 3, 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatToAbletonBeats("2|4/3", 3, 4)).toBeCloseTo(3 + 1 / 3, 10);

      // Triplets in 6/8 (1 Ableton beat = 2 eighth notes)
      expect(barBeatToAbletonBeats("1|4/3", 6, 8)).toBeCloseTo(1 / 6, 10);
      expect(barBeatToAbletonBeats("1|7/3", 6, 8)).toBeCloseTo(2 / 3, 10);

      // Dotted notes
      expect(barBeatToAbletonBeats("1|3/2", 4, 4)).toBe(0.5);
      expect(barBeatToAbletonBeats("2|5/2", 4, 4)).toBe(5.5);
    });
  });

  describe("round-trip conversions", () => {
    it("beatsToBarBeat and barBeatToBeats are inverses", () => {
      const testCases = [
        { beats: 0, beatsPerBar: 4 },
        { beats: 1.5, beatsPerBar: 4 },
        { beats: 7.25, beatsPerBar: 4 },
        { beats: 0, beatsPerBar: 3 },
        { beats: 2.333, beatsPerBar: 3 },
        { beats: 5.667, beatsPerBar: 6 },
      ];

      for (const { beats, beatsPerBar } of testCases) {
        const barBeat = beatsToBarBeat(beats, beatsPerBar);
        const backToBeats = barBeatToBeats(barBeat, beatsPerBar);

        expect(backToBeats).toBeCloseTo(beats, 10);
      }
    });

    it("fractional notation round-trips correctly", () => {
      // Test that fractional inputs convert correctly
      const testCases = [
        { barBeat: "1|4/3", beatsPerBar: 4, expectedBeats: 1 / 3 },
        { barBeat: "1|5/3", beatsPerBar: 4, expectedBeats: 2 / 3 },
        { barBeat: "1|7/3", beatsPerBar: 4, expectedBeats: 4 / 3 },
        { barBeat: "2|4/3", beatsPerBar: 3, expectedBeats: 3 + 1 / 3 },
        { barBeat: "1|3/2", beatsPerBar: 4, expectedBeats: 0.5 },
      ];

      for (const { barBeat, beatsPerBar, expectedBeats } of testCases) {
        const beats = barBeatToBeats(barBeat, beatsPerBar);

        expect(beats).toBeCloseTo(expectedBeats, 10);
      }
    });

    it("abletonBeatsToBarBeat and barBeatToAbletonBeats are inverses", () => {
      const testCases = [
        { abletonBeats: 0, num: 4, den: 4 },
        { abletonBeats: 1.5, num: 4, den: 4 },
        { abletonBeats: 7.25, num: 4, den: 4 },
        { abletonBeats: 0, num: 3, den: 4 },
        { abletonBeats: 2.5, num: 3, den: 4 },
        { abletonBeats: 1.75, num: 6, den: 8 },
        { abletonBeats: 4.5, num: 6, den: 8 },
        { abletonBeats: 2.25, num: 9, den: 8 },
        { abletonBeats: 6, num: 2, den: 2 },
        { abletonBeats: 1.75, num: 12, den: 16 },
      ];

      for (const { abletonBeats, num, den } of testCases) {
        const barBeat = abletonBeatsToBarBeat(abletonBeats, num, den);
        const backToAbletonBeats = barBeatToAbletonBeats(barBeat, num, den);

        expect(backToAbletonBeats).toBeCloseTo(abletonBeats, 10);
      }
    });
  });

  describe("edge cases and precision", () => {
    it("handles very small floating point values", () => {
      expect(beatsToBarBeat(0.001, 4)).toBe("1|1.001");
      expect(barBeatToBeats("1|1.001", 4)).toBeCloseTo(0.001, 5);
    });

    it("handles large beat values", () => {
      expect(beatsToBarBeat(1000, 4)).toBe("251|1");
      expect(barBeatToBeats("251|1", 4)).toBe(1000);
    });

    it("maintains precision through wrapper function conversions", () => {
      const originalAbletonBeats = 12.3456789;
      const barBeat = abletonBeatsToBarBeat(originalAbletonBeats, 4, 4);
      const finalAbletonBeats = barBeatToAbletonBeats(barBeat, 4, 4);

      expect(finalAbletonBeats).toBeCloseTo(originalAbletonBeats, 3);
    });

    it("handles complex time signatures with wrapper functions", () => {
      // 11/16 time
      expect(abletonBeatsToBarBeat(0, 11, 16)).toBe("1|1");
      expect(abletonBeatsToBarBeat(2.75, 11, 16)).toBe("2|1");
      expect(barBeatToAbletonBeats("2|1", 11, 16)).toBe(2.75);

      // 15/8 time
      expect(abletonBeatsToBarBeat(0, 15, 8)).toBe("1|1");
      expect(abletonBeatsToBarBeat(7.5, 15, 8)).toBe("2|1");
      expect(barBeatToAbletonBeats("2|1", 15, 8)).toBe(7.5);
    });
  });
});
