import { describe, expect, it } from "vitest";
import { cos, tri, saw, square, noise, ramp } from "../modulation-waveforms.js";

describe("Modulation Waveforms", () => {
  describe("cos()", () => {
    it("starts at 1.0 at phase 0", () => {
      expect(cos(0)).toBeCloseTo(1.0, 10);
    });

    it("reaches 0 at phase 0.25", () => {
      expect(cos(0.25)).toBeCloseTo(0.0, 10);
    });

    it("reaches -1.0 at phase 0.5", () => {
      expect(cos(0.5)).toBeCloseTo(-1.0, 10);
    });

    it("reaches 0 at phase 0.75", () => {
      expect(cos(0.75)).toBeCloseTo(0.0, 10);
    });

    it("returns to 1.0 at phase 1.0", () => {
      expect(cos(1.0)).toBeCloseTo(1.0, 10);
    });

    it("handles phase > 1.0 (wraps around)", () => {
      expect(cos(1.25)).toBeCloseTo(cos(0.25), 10);
      expect(cos(2.0)).toBeCloseTo(cos(0.0), 10);
    });

    it("returns values in range [-1.0, 1.0]", () => {
      for (let phase = 0; phase <= 1; phase += 0.1) {
        const value = cos(phase);

        expect(value).toBeGreaterThanOrEqual(-1.0);
        expect(value).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe("tri()", () => {
    it("starts at 1.0 at phase 0", () => {
      expect(tri(0)).toBe(1.0);
    });

    it("reaches 0 at phase 0.25", () => {
      expect(tri(0.25)).toBeCloseTo(0.0, 10);
    });

    it("reaches -1.0 at phase 0.5", () => {
      expect(tri(0.5)).toBe(-1.0);
    });

    it("reaches 0 at phase 0.75", () => {
      expect(tri(0.75)).toBeCloseTo(0.0, 10);
    });

    it("returns to 1.0 at phase 1.0", () => {
      expect(tri(1.0)).toBe(1.0);
    });

    it("descends linearly in first half", () => {
      // Check linear descent from 1.0 to -1.0
      expect(tri(0.0)).toBe(1.0);
      expect(tri(0.1)).toBeCloseTo(0.6, 10);
      expect(tri(0.2)).toBeCloseTo(0.2, 10);
      expect(tri(0.3)).toBeCloseTo(-0.2, 10);
      expect(tri(0.4)).toBeCloseTo(-0.6, 10);
      expect(tri(0.5)).toBe(-1.0);
    });

    it("ascends linearly in second half", () => {
      // Check linear ascent from -1.0 to 1.0
      expect(tri(0.5)).toBe(-1.0);
      expect(tri(0.6)).toBeCloseTo(-0.6, 10);
      expect(tri(0.7)).toBeCloseTo(-0.2, 10);
      expect(tri(0.8)).toBeCloseTo(0.2, 10);
      expect(tri(0.9)).toBeCloseTo(0.6, 10);
      expect(tri(1.0)).toBe(1.0);
    });

    it("handles phase > 1.0 (wraps around)", () => {
      expect(tri(1.25)).toBeCloseTo(tri(0.25), 10);
      expect(tri(2.0)).toBe(tri(0.0));
    });

    it("returns values in range [-1.0, 1.0]", () => {
      for (let phase = 0; phase <= 1; phase += 0.05) {
        const value = tri(phase);

        expect(value).toBeGreaterThanOrEqual(-1.0);
        expect(value).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe("saw()", () => {
    it("starts at 1.0 at phase 0", () => {
      expect(saw(0)).toBe(1.0);
    });

    it("reaches 0 at phase 0.5", () => {
      expect(saw(0.5)).toBeCloseTo(0.0, 10);
    });

    it("reaches -1.0 just before phase 1.0", () => {
      expect(saw(0.999)).toBeCloseTo(-1.0 + 0.002, 2);
    });

    it("jumps back to 1.0 at phase 1.0", () => {
      expect(saw(1.0)).toBe(1.0);
    });

    it("descends linearly throughout cycle", () => {
      expect(saw(0.0)).toBe(1.0);
      expect(saw(0.25)).toBeCloseTo(0.5, 10);
      expect(saw(0.5)).toBeCloseTo(0.0, 10);
      expect(saw(0.75)).toBeCloseTo(-0.5, 10);
    });

    it("handles phase > 1.0 (wraps around)", () => {
      expect(saw(1.25)).toBeCloseTo(saw(0.25), 10);
      expect(saw(2.0)).toBe(saw(0.0));
    });

    it("returns values in range [-1.0, 1.0]", () => {
      for (let phase = 0; phase <= 1; phase += 0.05) {
        const value = saw(phase);

        expect(value).toBeGreaterThanOrEqual(-1.0);
        expect(value).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe("square()", () => {
    it("starts at 1.0 at phase 0 (default 50% duty cycle)", () => {
      expect(square(0)).toBe(1.0);
    });

    it("stays at 1.0 until phase 0.5 (default 50% duty cycle)", () => {
      expect(square(0.25)).toBe(1.0);
      expect(square(0.49)).toBe(1.0);
    });

    it("switches to -1.0 at phase 0.5 (default 50% duty cycle)", () => {
      expect(square(0.5)).toBe(-1.0);
      expect(square(0.75)).toBe(-1.0);
      expect(square(0.99)).toBe(-1.0);
    });

    it("returns to 1.0 at phase 1.0 (default 50% duty cycle)", () => {
      expect(square(1.0)).toBe(1.0);
    });

    it("supports 25% duty cycle", () => {
      expect(square(0, 0.25)).toBe(1.0);
      expect(square(0.1, 0.25)).toBe(1.0);
      expect(square(0.24, 0.25)).toBe(1.0);
      expect(square(0.25, 0.25)).toBe(-1.0);
      expect(square(0.5, 0.25)).toBe(-1.0);
      expect(square(0.75, 0.25)).toBe(-1.0);
    });

    it("supports 75% duty cycle", () => {
      expect(square(0, 0.75)).toBe(1.0);
      expect(square(0.25, 0.75)).toBe(1.0);
      expect(square(0.5, 0.75)).toBe(1.0);
      expect(square(0.74, 0.75)).toBe(1.0);
      expect(square(0.75, 0.75)).toBe(-1.0);
      expect(square(0.9, 0.75)).toBe(-1.0);
    });

    it("handles phase > 1.0 (wraps around)", () => {
      expect(square(1.25, 0.5)).toBe(square(0.25, 0.5));
      expect(square(2.0, 0.5)).toBe(square(0.0, 0.5));
    });

    it("returns only 1.0 or -1.0", () => {
      for (let phase = 0; phase <= 1; phase += 0.05) {
        const value = square(phase);

        expect([1.0, -1.0]).toContain(value);
      }
    });
  });

  describe("noise()", () => {
    it("returns a value in range [-1.0, 1.0]", () => {
      for (let i = 0; i < 100; i++) {
        const value = noise();

        expect(value).toBeGreaterThanOrEqual(-1.0);
        expect(value).toBeLessThanOrEqual(1.0);
      }
    });

    it("returns different values on each call (non-deterministic)", () => {
      const values = new Set();

      for (let i = 0; i < 100; i++) {
        values.add(noise());
      }

      // Should have many unique values (high probability)
      expect(values.size).toBeGreaterThan(90);
    });

    it("generates values across the full range", () => {
      let hasPositive = false;
      let hasNegative = false;

      for (let i = 0; i < 100; i++) {
        const value = noise();

        if (value > 0) {
          hasPositive = true;
        }

        if (value < 0) {
          hasNegative = true;
        }
      }

      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });
  });

  describe("ramp()", () => {
    it("starts at start value at phase 0", () => {
      expect(ramp(0, 0, 1)).toBe(0);
      expect(ramp(0, -1, 1)).toBe(-1);
      expect(ramp(0, 0.5, 1.5)).toBe(0.5);
    });

    it("ends at end value at phase 1", () => {
      expect(ramp(1, 0, 1)).toBe(0); // wraps back to start
      expect(ramp(0.999, 0, 1)).toBeCloseTo(0.999, 10);
    });

    it("interpolates linearly from start to end", () => {
      expect(ramp(0, 0, 1)).toBe(0);
      expect(ramp(0.25, 0, 1)).toBe(0.25);
      expect(ramp(0.5, 0, 1)).toBe(0.5);
      expect(ramp(0.75, 0, 1)).toBe(0.75);
    });

    it("supports reverse ramp (descending)", () => {
      expect(ramp(0, 1, 0)).toBe(1);
      expect(ramp(0.25, 1, 0)).toBe(0.75);
      expect(ramp(0.5, 1, 0)).toBe(0.5);
      expect(ramp(0.75, 1, 0)).toBe(0.25);
    });

    it("supports arbitrary value ranges", () => {
      expect(ramp(0, -0.5, 0.5)).toBe(-0.5);
      expect(ramp(0.5, -0.5, 0.5)).toBe(0);
      expect(ramp(1, -0.5, 0.5)).toBe(-0.5); // wraps

      expect(ramp(0, 10, 20)).toBe(10);
      expect(ramp(0.5, 10, 20)).toBe(15);
    });

    it("supports speed = 2 (two complete ramps)", () => {
      // Speed 2: completes two full ramps over phase 0-1
      expect(ramp(0, 0, 1, 2)).toBe(0);
      expect(ramp(0.25, 0, 1, 2)).toBe(0.5); // halfway through first ramp
      expect(ramp(0.5, 0, 1, 2)).toBe(0); // start of second ramp
      expect(ramp(0.75, 0, 1, 2)).toBe(0.5); // halfway through second ramp
    });

    it("supports speed = 0.5 (half ramp over period)", () => {
      // Speed 0.5: completes half a ramp over phase 0-1
      expect(ramp(0, 0, 1, 0.5)).toBe(0);
      expect(ramp(0.5, 0, 1, 0.5)).toBe(0.25);
      expect(ramp(1, 0, 1, 0.5)).toBe(0.5); // only reaches halfway
    });

    it("supports speed = 3", () => {
      // Speed 3: completes three full ramps
      expect(ramp(0, 0, 1, 3)).toBe(0);
      expect(ramp(1 / 3, 0, 1, 3)).toBeCloseTo(0, 10); // end of first ramp
      expect(ramp(0.5, 0, 1, 3)).toBeCloseTo(0.5, 10); // middle of second ramp
      expect(ramp(2 / 3, 0, 1, 3)).toBeCloseTo(0, 10); // end of second ramp
    });

    it("handles phase > 1.0 with wrapping", () => {
      expect(ramp(1.25, 0, 1)).toBeCloseTo(ramp(0.25, 0, 1), 10);
      expect(ramp(2.0, 0, 1)).toBe(ramp(0, 0, 1));
      expect(ramp(2.5, 0, 1)).toBe(ramp(0.5, 0, 1));
    });

    it("handles phase wrapping with speed", () => {
      // Speed 2 with phase > 1
      expect(ramp(1.25, 0, 1, 2)).toBeCloseTo(ramp(0.25, 0, 1, 2), 10);
    });

    it("uses default speed of 1", () => {
      expect(ramp(0.5, 0, 1)).toBe(0.5);
      expect(ramp(0.5, 0, 1, 1)).toBe(0.5);
    });
  });
});
