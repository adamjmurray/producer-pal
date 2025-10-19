import { describe, expect, it } from "vitest";
import { parseFrequency } from "./modulation-frequency.js";

describe("Modulation Frequency Parser", () => {
  describe("beat-only frequencies in 4/4", () => {
    it("parses 1t as 1 beat period", () => {
      const freq = { type: "frequency", bars: 0, beats: 1 };
      expect(parseFrequency(freq, 4, 4)).toBe(1);
    });

    it("parses 2t as 2 beats period", () => {
      const freq = { type: "frequency", bars: 0, beats: 2 };
      expect(parseFrequency(freq, 4, 4)).toBe(2);
    });

    it("parses 0.5t as 0.5 beats period", () => {
      const freq = { type: "frequency", bars: 0, beats: 0.5 };
      expect(parseFrequency(freq, 4, 4)).toBe(0.5);
    });

    it("parses 4t as 4 beats period", () => {
      const freq = { type: "frequency", bars: 0, beats: 4 };
      expect(parseFrequency(freq, 4, 4)).toBe(4);
    });
  });

  describe("bar:beat frequencies in 4/4", () => {
    it("parses 1:0t as 4 beats period (1 bar in 4/4)", () => {
      const freq = { type: "frequency", bars: 1, beats: 0 };
      expect(parseFrequency(freq, 4, 4)).toBe(4);
    });

    it("parses 0:1t as 1 beat period", () => {
      const freq = { type: "frequency", bars: 0, beats: 1 };
      expect(parseFrequency(freq, 4, 4)).toBe(1);
    });

    it("parses 2:0t as 8 beats period (2 bars in 4/4)", () => {
      const freq = { type: "frequency", bars: 2, beats: 0 };
      expect(parseFrequency(freq, 4, 4)).toBe(8);
    });

    it("parses 1:2t as 6 beats period (1 bar + 2 beats in 4/4)", () => {
      const freq = { type: "frequency", bars: 1, beats: 2 };
      expect(parseFrequency(freq, 4, 4)).toBe(6);
    });

    it("parses 0:0.5t as 0.5 beats period", () => {
      const freq = { type: "frequency", bars: 0, beats: 0.5 };
      expect(parseFrequency(freq, 4, 4)).toBe(0.5);
    });

    it("parses 4:0t as 16 beats period (4 bars in 4/4)", () => {
      const freq = { type: "frequency", bars: 4, beats: 0 };
      expect(parseFrequency(freq, 4, 4)).toBe(16);
    });
  });

  describe("frequencies in 3/4", () => {
    it("parses 1t as 1 beat period", () => {
      const freq = { type: "frequency", bars: 0, beats: 1 };
      expect(parseFrequency(freq, 3, 4)).toBe(1);
    });

    it("parses 1:0t as 3 beats period (1 bar in 3/4)", () => {
      const freq = { type: "frequency", bars: 1, beats: 0 };
      expect(parseFrequency(freq, 3, 4)).toBe(3);
    });

    it("parses 2:0t as 6 beats period (2 bars in 3/4)", () => {
      const freq = { type: "frequency", bars: 2, beats: 0 };
      expect(parseFrequency(freq, 3, 4)).toBe(6);
    });

    it("parses 1:1t as 4 beats period (1 bar + 1 beat in 3/4)", () => {
      const freq = { type: "frequency", bars: 1, beats: 1 };
      expect(parseFrequency(freq, 3, 4)).toBe(4);
    });
  });

  describe("frequencies in 6/8", () => {
    it("parses 1t as 1 beat period", () => {
      const freq = { type: "frequency", bars: 0, beats: 1 };
      expect(parseFrequency(freq, 6, 8)).toBe(1);
    });

    it("parses 1:0t as 6 beats period (1 bar in 6/8)", () => {
      const freq = { type: "frequency", bars: 1, beats: 0 };
      expect(parseFrequency(freq, 6, 8)).toBe(6);
    });

    it("parses 2:0t as 12 beats period (2 bars in 6/8)", () => {
      const freq = { type: "frequency", bars: 2, beats: 0 };
      expect(parseFrequency(freq, 6, 8)).toBe(12);
    });

    it("parses 1:3t as 9 beats period (1 bar + 3 beats in 6/8)", () => {
      const freq = { type: "frequency", bars: 1, beats: 3 };
      expect(parseFrequency(freq, 6, 8)).toBe(9);
    });
  });

  describe("frequencies in 7/8", () => {
    it("parses 1t as 1 beat period", () => {
      const freq = { type: "frequency", bars: 0, beats: 1 };
      expect(parseFrequency(freq, 7, 8)).toBe(1);
    });

    it("parses 1:0t as 7 beats period (1 bar in 7/8)", () => {
      const freq = { type: "frequency", bars: 1, beats: 0 };
      expect(parseFrequency(freq, 7, 8)).toBe(7);
    });

    it("parses 2:0t as 14 beats period (2 bars in 7/8)", () => {
      const freq = { type: "frequency", bars: 2, beats: 0 };
      expect(parseFrequency(freq, 7, 8)).toBe(14);
    });
  });

  describe("fractional beats", () => {
    it("parses 0:0.25t as 0.25 beats period in 4/4", () => {
      const freq = { type: "frequency", bars: 0, beats: 0.25 };
      expect(parseFrequency(freq, 4, 4)).toBe(0.25);
    });

    it("parses 1:1.5t as 5.5 beats period in 4/4 (1 bar + 1.5 beats)", () => {
      const freq = { type: "frequency", bars: 1, beats: 1.5 };
      expect(parseFrequency(freq, 4, 4)).toBe(5.5);
    });

    it("handles fractional beats from parser (1/3)", () => {
      const freq = { type: "frequency", bars: 0, beats: 1 / 3 };
      expect(parseFrequency(freq, 4, 4)).toBeCloseTo(1 / 3, 10);
    });
  });

  describe("error handling", () => {
    it("throws on invalid frequency object type", () => {
      const invalidFreq = { type: "invalid", bars: 1, beats: 0 };
      expect(() => parseFrequency(invalidFreq, 4, 4)).toThrow(
        'expected type "frequency"',
      );
    });

    it("throws on zero period (0:0t)", () => {
      const freq = { type: "frequency", bars: 0, beats: 0 };
      expect(() => parseFrequency(freq, 4, 4)).toThrow(
        "Frequency period must be positive",
      );
    });
  });

  describe("real-world examples", () => {
    it("1:0t in 4/4 = 4 beats (one bar modulation)", () => {
      const freq = { type: "frequency", bars: 1, beats: 0 };
      expect(parseFrequency(freq, 4, 4)).toBe(4);
    });

    it("4:0t in 4/4 = 16 beats (four bar modulation)", () => {
      const freq = { type: "frequency", bars: 4, beats: 0 };
      expect(parseFrequency(freq, 4, 4)).toBe(16);
    });

    it("2t in any time signature = 2 beats", () => {
      const freq = { type: "frequency", bars: 0, beats: 2 };
      expect(parseFrequency(freq, 4, 4)).toBe(2);
      expect(parseFrequency(freq, 3, 4)).toBe(2);
      expect(parseFrequency(freq, 6, 8)).toBe(2);
    });

    it("0:2t in 6/8 = 2 beats", () => {
      const freq = { type: "frequency", bars: 0, beats: 2 };
      expect(parseFrequency(freq, 6, 8)).toBe(2);
    });
  });
});
