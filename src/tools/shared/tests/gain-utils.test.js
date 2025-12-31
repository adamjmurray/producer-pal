import { describe, it, expect } from "vitest";
import { liveGainToDb, dbToLiveGain } from "#src/tools/shared/gain-utils.js";

describe("gain-utils", () => {
  describe("liveGainToDb", () => {
    it("should return -Infinity for gain = 0", () => {
      expect(liveGainToDb(0)).toBe(-Infinity);
    });

    it("should return ~0 dB for gain = 0.4 (unity)", () => {
      // With lookup table, expect high accuracy
      expect(liveGainToDb(0.4)).toBeCloseTo(0, 1);
    });

    it("should return 24 dB for gain = 1.0 (maximum)", () => {
      expect(liveGainToDb(1.0)).toBe(24);
    });

    it("should handle mid-range values correctly", () => {
      // With lookup table, expect < 0.5 dB error
      expect(liveGainToDb(0.5)).toBeCloseTo(4, 0);
      expect(liveGainToDb(0.6)).toBeCloseTo(8, 0);
      expect(liveGainToDb(0.7)).toBeCloseTo(12, 0);
    });

    it("should handle low-range values with good accuracy", () => {
      // Actual values from Live's lookup table
      expect(liveGainToDb(0.3)).toBeCloseTo(-6.2, 0);
      expect(liveGainToDb(0.35)).toBeCloseTo(-2.6, 0);
    });

    it("should handle very low gain values reasonably", () => {
      // Even at very low levels, lookup table should be accurate
      const result1 = liveGainToDb(0.1);
      const result2 = liveGainToDb(0.05);

      // Just verify they're in a reasonable range
      expect(result1).toBeGreaterThan(-35);
      expect(result1).toBeLessThan(-25);
      expect(result2).toBeGreaterThan(-45);
      expect(result2).toBeLessThan(-35);
    });

    it("should return -Infinity for negative gain values", () => {
      expect(liveGainToDb(-0.1)).toBe(-Infinity);
    });

    it("should return 24 dB for gain values greater than 1", () => {
      expect(liveGainToDb(1.5)).toBe(24);
      expect(liveGainToDb(2.0)).toBe(24);
    });

    it("should format dB values cleanly (2 decimal places, no trailing zeros)", () => {
      // Test that formatting removes unnecessary precision
      const gain = dbToLiveGain(-17);
      const dB = liveGainToDb(gain);

      // Should be exactly -17, not -17.00005187988281 or -17.00
      expect(dB).toBe(-17);

      // Test other clean values
      expect(liveGainToDb(0.4)).toBe(0); // Not 0.00
      expect(liveGainToDb(1.0)).toBe(24); // Not 24.00
    });
  });

  describe("dbToLiveGain", () => {
    it("should return 0 for -Infinity dB", () => {
      expect(dbToLiveGain(-Infinity)).toBe(0);
    });

    it("should return ~0 for very low dB values", () => {
      expect(dbToLiveGain(-70)).toBeCloseTo(0, 3);
    });

    it("should return ~0.4 for 0 dB (unity)", () => {
      expect(dbToLiveGain(0)).toBeCloseTo(0.4, 2);
    });

    it("should return 1.0 for 24 dB (maximum)", () => {
      expect(dbToLiveGain(24)).toBe(1.0);
    });

    it("should handle mid-range dB values correctly", () => {
      // Expect high accuracy with lookup table
      expect(dbToLiveGain(4)).toBeCloseTo(0.5, 2);
      expect(dbToLiveGain(8)).toBeCloseTo(0.6, 2);
      expect(dbToLiveGain(12)).toBeCloseTo(0.7, 2);
    });

    it("should handle critical mixing range (-18 to 0 dB) accurately", () => {
      // This is the range users care most about
      // Actual values from Live's lookup table
      expect(dbToLiveGain(-18)).toBeCloseTo(0.187, 2);
      expect(dbToLiveGain(-12)).toBeCloseTo(0.238, 2);
      expect(dbToLiveGain(-6)).toBeCloseTo(0.302, 2);
    });

    it("should clamp values above 24 dB to 1.0", () => {
      expect(dbToLiveGain(30)).toBe(1.0);
      expect(dbToLiveGain(100)).toBe(1.0);
    });

    it("should clamp values below -70 dB to 0", () => {
      expect(dbToLiveGain(-100)).toBe(0);
    });

    it("should handle extreme high dB values", () => {
      expect(dbToLiveGain(50)).toBe(1.0);
      expect(dbToLiveGain(1000)).toBe(1.0);
    });
  });

  describe("round-trip conversion", () => {
    it("should round-trip accurately across full range", () => {
      const testGains = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

      for (const gain of testGains) {
        const dB = liveGainToDb(gain);
        const gainBack = dbToLiveGain(dB);

        // With lookup table, expect very good round-trip accuracy
        expect(gainBack).toBeCloseTo(gain, 2);
      }
    });

    it("should round-trip accurately for common dB values", () => {
      const testDbValues = [-18, -12, -6, 0, 6, 12, 18, 24];

      for (const dB of testDbValues) {
        const gain = dbToLiveGain(dB);
        const dbBack = liveGainToDb(gain);

        // Expect < 0.5 dB round-trip error
        expect(dbBack).toBeCloseTo(dB, 0);
      }
    });

    it("should handle edge cases", () => {
      // Test extreme values
      expect(dbToLiveGain(liveGainToDb(0.001))).toBeGreaterThan(0);
      expect(liveGainToDb(dbToLiveGain(-60))).toBeLessThan(-50);
    });
  });
});
