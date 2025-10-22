import { describe, expect, it } from "vitest";
import {
  abletonBeatsToBarBeat,
  abletonBeatsToBarBeatDuration,
  barBeatDurationToAbletonBeats,
  barBeatDurationToMusicalBeats,
  barBeatToAbletonBeats,
  barBeatToBeats,
  beatsToBarBeat,
  timeSigToAbletonBeatsPerBar,
} from "./barbeat-time";

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

    it("returns null when barBeat is null", () => {
      expect(barBeatToAbletonBeats(null, 4, 4)).toBeNull();
      expect(barBeatToAbletonBeats(null, 3, 4)).toBeNull();
      expect(barBeatToAbletonBeats(null, 6, 8)).toBeNull();
    });

    it("returns null when barBeat is undefined", () => {
      expect(barBeatToAbletonBeats(undefined, 4, 4)).toBeNull();
      expect(barBeatToAbletonBeats(undefined, 3, 4)).toBeNull();
      expect(barBeatToAbletonBeats(undefined, 6, 8)).toBeNull();
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

      testCases.forEach(({ beats, beatsPerBar }) => {
        const barBeat = beatsToBarBeat(beats, beatsPerBar);
        const backToBeats = barBeatToBeats(barBeat, beatsPerBar);
        expect(backToBeats).toBeCloseTo(beats, 10);
      });
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

      testCases.forEach(({ barBeat, beatsPerBar, expectedBeats }) => {
        const beats = barBeatToBeats(barBeat, beatsPerBar);
        expect(beats).toBeCloseTo(expectedBeats, 10);
      });
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

      testCases.forEach(({ abletonBeats, num, den }) => {
        const barBeat = abletonBeatsToBarBeat(abletonBeats, num, den);
        const backToAbletonBeats = barBeatToAbletonBeats(barBeat, num, den);
        expect(backToAbletonBeats).toBeCloseTo(abletonBeats, 10);
      });
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

describe("timeSigToAbletonBeatsPerBar", () => {
  it("converts time signatures to Ableton beats per bar", () => {
    expect(timeSigToAbletonBeatsPerBar(4, 4)).toBe(4); // 4/4 = 4 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(3, 4)).toBe(3); // 3/4 = 3 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(6, 8)).toBe(3); // 6/8 = 3 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(2, 2)).toBe(4); // 2/2 = 4 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(9, 8)).toBe(4.5); // 9/8 = 4.5 quarter notes per bar
    expect(timeSigToAbletonBeatsPerBar(12, 16)).toBe(3); // 12/16 = 3 quarter notes per bar
  });
});

describe("abletonBeatsToBarBeatDuration", () => {
  describe("4/4 time signature", () => {
    it("converts zero duration", () => {
      expect(abletonBeatsToBarBeatDuration(0, 4, 4)).toBe("0:0");
    });

    it("converts beat-only durations", () => {
      expect(abletonBeatsToBarBeatDuration(1, 4, 4)).toBe("0:1");
      expect(abletonBeatsToBarBeatDuration(2, 4, 4)).toBe("0:2");
      expect(abletonBeatsToBarBeatDuration(3, 4, 4)).toBe("0:3");
    });

    it("converts exact bar durations", () => {
      expect(abletonBeatsToBarBeatDuration(4, 4, 4)).toBe("1:0");
      expect(abletonBeatsToBarBeatDuration(8, 4, 4)).toBe("2:0");
      expect(abletonBeatsToBarBeatDuration(12, 4, 4)).toBe("3:0");
    });

    it("converts bar + beat durations", () => {
      expect(abletonBeatsToBarBeatDuration(5, 4, 4)).toBe("1:1");
      expect(abletonBeatsToBarBeatDuration(6, 4, 4)).toBe("1:2");
      expect(abletonBeatsToBarBeatDuration(7, 4, 4)).toBe("1:3");
      expect(abletonBeatsToBarBeatDuration(9, 4, 4)).toBe("2:1");
    });

    it("handles fractional beats", () => {
      expect(abletonBeatsToBarBeatDuration(1.5, 4, 4)).toBe("0:1.5");
      expect(abletonBeatsToBarBeatDuration(2.25, 4, 4)).toBe("0:2.25");
      expect(abletonBeatsToBarBeatDuration(4.5, 4, 4)).toBe("1:0.5");
      expect(abletonBeatsToBarBeatDuration(5.75, 4, 4)).toBe("1:1.75");
    });
  });

  describe("6/8 time signature", () => {
    it("converts durations using eighth note musical beats", () => {
      // In 6/8: 6 eighth notes per bar = 3 quarter notes per bar
      expect(abletonBeatsToBarBeatDuration(0, 6, 8)).toBe("0:0");
      expect(abletonBeatsToBarBeatDuration(0.5, 6, 8)).toBe("0:1"); // 1 eighth note
      expect(abletonBeatsToBarBeatDuration(1, 6, 8)).toBe("0:2"); // 2 eighth notes
      expect(abletonBeatsToBarBeatDuration(1.5, 6, 8)).toBe("0:3"); // 3 eighth notes
      expect(abletonBeatsToBarBeatDuration(3, 6, 8)).toBe("1:0"); // 1 complete bar
      expect(abletonBeatsToBarBeatDuration(3.5, 6, 8)).toBe("1:1"); // 1 bar + 1 eighth note
      expect(abletonBeatsToBarBeatDuration(6, 6, 8)).toBe("2:0"); // 2 complete bars
    });
  });

  describe("2/2 time signature", () => {
    it("converts durations using half note musical beats", () => {
      // In 2/2: 2 half notes per bar = 4 quarter notes per bar
      expect(abletonBeatsToBarBeatDuration(0, 2, 2)).toBe("0:0");
      expect(abletonBeatsToBarBeatDuration(2, 2, 2)).toBe("0:1"); // 1 half note
      expect(abletonBeatsToBarBeatDuration(4, 2, 2)).toBe("1:0"); // 1 complete bar
      expect(abletonBeatsToBarBeatDuration(6, 2, 2)).toBe("1:1"); // 1 bar + 1 half note
      expect(abletonBeatsToBarBeatDuration(8, 2, 2)).toBe("2:0"); // 2 complete bars
    });

    it("handles fractional half notes", () => {
      expect(abletonBeatsToBarBeatDuration(1, 2, 2)).toBe("0:0.5"); // 0.5 half notes
      expect(abletonBeatsToBarBeatDuration(3, 2, 2)).toBe("0:1.5"); // 1.5 half notes
      expect(abletonBeatsToBarBeatDuration(5, 2, 2)).toBe("1:0.5"); // 1 bar + 0.5 half notes
    });
  });

  describe("3/4 time signature", () => {
    it("converts durations using quarter note musical beats", () => {
      expect(abletonBeatsToBarBeatDuration(0, 3, 4)).toBe("0:0");
      expect(abletonBeatsToBarBeatDuration(1, 3, 4)).toBe("0:1");
      expect(abletonBeatsToBarBeatDuration(2, 3, 4)).toBe("0:2");
      expect(abletonBeatsToBarBeatDuration(3, 3, 4)).toBe("1:0"); // 1 complete bar
      expect(abletonBeatsToBarBeatDuration(4, 3, 4)).toBe("1:1");
      expect(abletonBeatsToBarBeatDuration(6, 3, 4)).toBe("2:0"); // 2 complete bars
    });
  });

  it("throws error for negative durations", () => {
    expect(() => abletonBeatsToBarBeatDuration(-1, 4, 4)).toThrow(
      "Duration cannot be negative, got: -1",
    );
  });
});

describe("barBeatDurationToAbletonBeats", () => {
  describe("4/4 time signature", () => {
    it("converts zero duration", () => {
      expect(barBeatDurationToAbletonBeats("0:0", 4, 4)).toBe(0);
    });

    it("converts beat-only durations", () => {
      expect(barBeatDurationToAbletonBeats("0:1", 4, 4)).toBe(1);
      expect(barBeatDurationToAbletonBeats("0:2", 4, 4)).toBe(2);
      expect(barBeatDurationToAbletonBeats("0:3", 4, 4)).toBe(3);
    });

    it("converts exact bar durations", () => {
      expect(barBeatDurationToAbletonBeats("1:0", 4, 4)).toBe(4);
      expect(barBeatDurationToAbletonBeats("2:0", 4, 4)).toBe(8);
      expect(barBeatDurationToAbletonBeats("3:0", 4, 4)).toBe(12);
    });

    it("converts bar + beat durations", () => {
      expect(barBeatDurationToAbletonBeats("1:1", 4, 4)).toBe(5);
      expect(barBeatDurationToAbletonBeats("1:2", 4, 4)).toBe(6);
      expect(barBeatDurationToAbletonBeats("1:3", 4, 4)).toBe(7);
      expect(barBeatDurationToAbletonBeats("2:1", 4, 4)).toBe(9);
    });

    it("handles fractional beats", () => {
      expect(barBeatDurationToAbletonBeats("0:1.5", 4, 4)).toBe(1.5);
      expect(barBeatDurationToAbletonBeats("0:2.25", 4, 4)).toBe(2.25);
      expect(barBeatDurationToAbletonBeats("1:0.5", 4, 4)).toBe(4.5);
      expect(barBeatDurationToAbletonBeats("1:1.75", 4, 4)).toBe(5.75);
    });
  });

  describe("6/8 time signature", () => {
    it("converts durations using eighth note musical beats", () => {
      expect(barBeatDurationToAbletonBeats("0:0", 6, 8)).toBe(0);
      expect(barBeatDurationToAbletonBeats("0:1", 6, 8)).toBe(0.5); // 1 eighth note
      expect(barBeatDurationToAbletonBeats("0:2", 6, 8)).toBe(1); // 2 eighth notes
      expect(barBeatDurationToAbletonBeats("0:6", 6, 8)).toBe(3); // 6 eighth notes
      expect(barBeatDurationToAbletonBeats("1:0", 6, 8)).toBe(3); // 1 complete bar
      expect(barBeatDurationToAbletonBeats("1:1", 6, 8)).toBe(3.5); // 1 bar + 1 eighth note
      expect(barBeatDurationToAbletonBeats("2:0", 6, 8)).toBe(6); // 2 complete bars
    });
  });

  describe("2/2 time signature", () => {
    it("converts durations using half note musical beats", () => {
      expect(barBeatDurationToAbletonBeats("0:0", 2, 2)).toBe(0);
      expect(barBeatDurationToAbletonBeats("0:1", 2, 2)).toBe(2); // 1 half note
      expect(barBeatDurationToAbletonBeats("1:0", 2, 2)).toBe(4); // 1 complete bar
      expect(barBeatDurationToAbletonBeats("1:1", 2, 2)).toBe(6); // 1 bar + 1 half note
      expect(barBeatDurationToAbletonBeats("2:0", 2, 2)).toBe(8); // 2 complete bars
    });

    it("handles fractional half notes", () => {
      expect(barBeatDurationToAbletonBeats("0:0.5", 2, 2)).toBe(1); // 0.5 half notes
      expect(barBeatDurationToAbletonBeats("0:1.5", 2, 2)).toBe(3); // 1.5 half notes
      expect(barBeatDurationToAbletonBeats("1:0.5", 2, 2)).toBe(5); // 1 bar + 0.5 half notes
    });
  });

  describe("3/4 time signature", () => {
    it("converts durations using quarter note musical beats", () => {
      expect(barBeatDurationToAbletonBeats("0:0", 3, 4)).toBe(0);
      expect(barBeatDurationToAbletonBeats("0:1", 3, 4)).toBe(1);
      expect(barBeatDurationToAbletonBeats("0:2", 3, 4)).toBe(2);
      expect(barBeatDurationToAbletonBeats("1:0", 3, 4)).toBe(3); // 1 complete bar
      expect(barBeatDurationToAbletonBeats("1:1", 3, 4)).toBe(4);
      expect(barBeatDurationToAbletonBeats("2:0", 3, 4)).toBe(6); // 2 complete bars
    });
  });

  it("handles fractional beat notation", () => {
    // Triplet durations in 4/4
    expect(barBeatDurationToAbletonBeats("0:1/3", 4, 4)).toBeCloseTo(1 / 3, 10);
    expect(barBeatDurationToAbletonBeats("0:2/3", 4, 4)).toBeCloseTo(2 / 3, 10);
    expect(barBeatDurationToAbletonBeats("0:4/3", 4, 4)).toBeCloseTo(4 / 3, 10);

    // Bar + fractional beats
    expect(barBeatDurationToAbletonBeats("1:1/2", 4, 4)).toBe(4.5);
    expect(barBeatDurationToAbletonBeats("1:3/4", 4, 4)).toBe(4.75);
    expect(barBeatDurationToAbletonBeats("2:5/3", 4, 4)).toBeCloseTo(
      8 + 5 / 3,
      10,
    );

    // Quintuplet durations
    expect(barBeatDurationToAbletonBeats("0:1/5", 4, 4)).toBeCloseTo(0.2, 10);
    expect(barBeatDurationToAbletonBeats("0:2/5", 4, 4)).toBeCloseTo(0.4, 10);
  });

  it("handles fractional durations in different time signatures", () => {
    // Triplets in 3/4
    expect(barBeatDurationToAbletonBeats("0:1/3", 3, 4)).toBeCloseTo(1 / 3, 10);
    expect(barBeatDurationToAbletonBeats("1:2/3", 3, 4)).toBeCloseTo(
      3 + 2 / 3,
      10,
    );

    // Triplets in 6/8 (1 musical beat = 0.5 Ableton beats)
    expect(barBeatDurationToAbletonBeats("0:1/3", 6, 8)).toBeCloseTo(1 / 6, 10);
    expect(barBeatDurationToAbletonBeats("0:2/3", 6, 8)).toBeCloseTo(1 / 3, 10);
  });

  it("throws error for invalid format", () => {
    // Pipe symbol used instead of colon
    expect(() => barBeatDurationToAbletonBeats("1|2", 4, 4)).toThrow(
      'Use ":" for bar:beat format, not "|"',
    );
    // Invalid bar:beat formats (missing parts)
    expect(() => barBeatDurationToAbletonBeats("1:", 4, 4)).toThrow(
      "Invalid bar:beat duration format",
    );
    expect(() => barBeatDurationToAbletonBeats("0:/3", 4, 4)).toThrow(
      "Invalid bar:beat duration format",
    );
    expect(() => barBeatDurationToAbletonBeats("0:1/", 4, 4)).toThrow(
      "Invalid bar:beat duration format",
    );
  });

  it("accepts beat-only integer format (NEW)", () => {
    // "1" is now valid - it means 1 beat
    expect(barBeatDurationToAbletonBeats("1", 4, 4)).toBe(1);
    expect(barBeatDurationToAbletonBeats("2", 4, 4)).toBe(2);
    expect(barBeatDurationToAbletonBeats("0", 4, 4)).toBe(0);
  });

  it("throws error for negative values", () => {
    expect(() => barBeatDurationToAbletonBeats("-1:0", 4, 4)).toThrow(
      "Bars in duration must be 0 or greater, got: -1",
    );
    expect(() => barBeatDurationToAbletonBeats("0:-1", 4, 4)).toThrow(
      "Beats in duration must be 0 or greater, got: -1",
    );
    expect(() => barBeatDurationToAbletonBeats("0:-1/3", 4, 4)).toThrow(
      "Beats in duration must be 0 or greater",
    );
  });
});

describe("barBeatDurationToMusicalBeats", () => {
  describe("beat-only format (NEW)", () => {
    it("parses decimal beat durations", () => {
      expect(barBeatDurationToMusicalBeats("2.5", 4, 4)).toBe(2.5);
      expect(barBeatDurationToMusicalBeats("1.0", 4, 4)).toBe(1.0);
      expect(barBeatDurationToMusicalBeats("0.25", 4, 4)).toBe(0.25);
      expect(barBeatDurationToMusicalBeats("3.75", 4, 4)).toBe(3.75);
    });

    it("parses fractional beat durations", () => {
      expect(barBeatDurationToMusicalBeats("5/2", 4, 4)).toBe(2.5);
      expect(barBeatDurationToMusicalBeats("3/4", 4, 4)).toBe(0.75);
      expect(barBeatDurationToMusicalBeats("1/3", 4, 4)).toBeCloseTo(1 / 3, 10);
      expect(barBeatDurationToMusicalBeats("4/3", 4, 4)).toBeCloseTo(4 / 3, 10);
    });

    it("parses beat durations with + operator (integer + fraction)", () => {
      expect(barBeatDurationToMusicalBeats("2+3/4", 4, 4)).toBe(2.75);
      expect(barBeatDurationToMusicalBeats("1+1/2", 4, 4)).toBe(1.5);
      expect(barBeatDurationToMusicalBeats("3+1/3", 4, 4)).toBeCloseTo(
        10 / 3,
        10,
      );
      expect(barBeatDurationToMusicalBeats("0+3/4", 4, 4)).toBe(0.75);
    });

    it("handles zero duration", () => {
      expect(barBeatDurationToMusicalBeats("0", 4, 4)).toBe(0);
      expect(barBeatDurationToMusicalBeats("0.0", 4, 4)).toBe(0);
    });

    it("throws error for negative durations", () => {
      expect(() => barBeatDurationToMusicalBeats("-1", 4, 4)).toThrow(
        "Beats in duration must be 0 or greater, got: -1",
      );
      expect(() => barBeatDurationToMusicalBeats("-2.5", 4, 4)).toThrow(
        "Beats in duration must be 0 or greater",
      );
    });

    it("throws error for division by zero", () => {
      expect(() => barBeatDurationToMusicalBeats("5/0", 4, 4)).toThrow(
        "Invalid fraction: division by zero",
      );
    });

    it("throws error for invalid formats", () => {
      expect(() => barBeatDurationToMusicalBeats("abc", 4, 4)).toThrow(
        "Invalid duration format",
      );
      expect(() => barBeatDurationToMusicalBeats("", 4, 4)).toThrow(
        "Invalid duration format",
      );
      expect(() => barBeatDurationToMusicalBeats("/3", 4, 4)).toThrow(
        "Invalid fraction format",
      );
      expect(() => barBeatDurationToMusicalBeats("5/", 4, 4)).toThrow(
        "Invalid fraction format",
      );
    });
  });

  describe("bar:beat format (existing)", () => {
    it("parses bar:beat durations in 4/4 time", () => {
      expect(barBeatDurationToMusicalBeats("0:0", 4, 4)).toBe(0);
      expect(barBeatDurationToMusicalBeats("0:1", 4, 4)).toBe(1);
      expect(barBeatDurationToMusicalBeats("1:0", 4, 4)).toBe(4);
      expect(barBeatDurationToMusicalBeats("2:1.5", 4, 4)).toBe(9.5);
    });

    it("parses bar:beat durations in 3/4 time", () => {
      expect(barBeatDurationToMusicalBeats("0:0", 3, 4)).toBe(0);
      expect(barBeatDurationToMusicalBeats("0:1", 3, 4)).toBe(1);
      expect(barBeatDurationToMusicalBeats("1:0", 3, 4)).toBe(3);
      expect(barBeatDurationToMusicalBeats("2:1.5", 3, 4)).toBe(7.5);
    });

    it("handles fractional beats in bar:beat format", () => {
      expect(barBeatDurationToMusicalBeats("0:1/3", 4, 4)).toBeCloseTo(
        1 / 3,
        10,
      );
      expect(barBeatDurationToMusicalBeats("1:3/4", 4, 4)).toBeCloseTo(
        4.75,
        10,
      );
      expect(barBeatDurationToMusicalBeats("2:5/3", 4, 4)).toBeCloseTo(
        8 + 5 / 3,
        10,
      );
    });

    it("handles bar:beat durations with + operator", () => {
      expect(barBeatDurationToMusicalBeats("1:2+1/3", 4, 4)).toBeCloseTo(
        4 + 2 + 1 / 3,
        10,
      );
      expect(barBeatDurationToMusicalBeats("0:3+3/4", 4, 4)).toBe(3.75);
      expect(barBeatDurationToMusicalBeats("2:1+1/2", 3, 4)).toBe(7.5);
    });

    it("throws error for negative values", () => {
      expect(() => barBeatDurationToMusicalBeats("-1:0", 4, 4)).toThrow(
        "Bars in duration must be 0 or greater, got: -1",
      );
      expect(() => barBeatDurationToMusicalBeats("0:-1", 4, 4)).toThrow(
        "Beats in duration must be 0 or greater, got: -1",
      );
    });

    it("throws error for invalid bar:beat format", () => {
      expect(() => barBeatDurationToMusicalBeats("1:", 4, 4)).toThrow(
        "Invalid bar:beat duration format",
      );
      expect(() => barBeatDurationToMusicalBeats(":2", 4, 4)).toThrow(
        "Invalid bar:beat duration format",
      );
    });
  });
});

describe("duration function round-trip consistency", () => {
  const testCases = [
    {
      timeSig: [4, 4],
      abletonBeats: [0, 1, 2, 3, 4, 5, 8, 12, 1.5, 2.25, 4.5, 7.75],
    },
    {
      timeSig: [6, 8],
      abletonBeats: [0, 0.5, 1, 1.5, 3, 3.5, 6, 9, 0.25, 1.75, 2.5],
    },
    { timeSig: [2, 2], abletonBeats: [0, 2, 4, 6, 8, 1, 3, 5, 7] },
    { timeSig: [3, 4], abletonBeats: [0, 1, 2, 3, 4, 6, 9, 1.5, 2.5] },
  ];

  testCases.forEach(({ timeSig, abletonBeats }) => {
    describe(`${timeSig[0]}/${timeSig[1]} time signature`, () => {
      abletonBeats.forEach((beats) => {
        it(`round-trip consistency for ${beats} Ableton beats`, () => {
          const duration = abletonBeatsToBarBeatDuration(
            beats,
            timeSig[0],
            timeSig[1],
          );
          const converted = barBeatDurationToAbletonBeats(
            duration,
            timeSig[0],
            timeSig[1],
          );
          expect(converted).toBeCloseTo(beats, 10); // High precision due to floating point
        });
      });
    });
  });
});
