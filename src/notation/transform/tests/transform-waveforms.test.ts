// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  choose,
  cos,
  curve,
  rand,
  ramp,
  saw,
  sin,
  square,
  tri,
} from "#src/notation/transform/transform-waveforms.ts";

describe("Transform Waveforms", () => {
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

  describe("sin()", () => {
    it("starts at 0.0 at phase 0", () => {
      expect(sin(0)).toBeCloseTo(0.0, 10);
    });

    it("reaches 1.0 at phase 0.25", () => {
      expect(sin(0.25)).toBeCloseTo(1.0, 10);
    });

    it("reaches 0 at phase 0.5", () => {
      expect(sin(0.5)).toBeCloseTo(0.0, 10);
    });

    it("reaches -1.0 at phase 0.75", () => {
      expect(sin(0.75)).toBeCloseTo(-1.0, 10);
    });

    it("returns to 0.0 at phase 1.0", () => {
      expect(sin(1.0)).toBeCloseTo(0.0, 10);
    });

    it("handles phase > 1.0 (wraps around)", () => {
      expect(sin(1.25)).toBeCloseTo(sin(0.25), 10);
      expect(sin(2.0)).toBeCloseTo(sin(0.0), 10);
    });

    it("returns values in range [-1.0, 1.0]", () => {
      for (let phase = 0; phase <= 1; phase += 0.1) {
        const value = sin(phase);

        expect(value).toBeGreaterThanOrEqual(-1.0);
        expect(value).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe("tri()", () => {
    it("starts at 0.0 at phase 0", () => {
      expect(tri(0)).toBe(0.0);
    });

    it("reaches 1.0 at phase 0.25", () => {
      expect(tri(0.25)).toBe(1.0);
    });

    it("reaches 0.0 at phase 0.5", () => {
      expect(tri(0.5)).toBeCloseTo(0.0, 10);
    });

    it("reaches -1.0 at phase 0.75", () => {
      expect(tri(0.75)).toBe(-1.0);
    });

    it("returns to 0.0 at phase 1.0", () => {
      expect(tri(1.0)).toBeCloseTo(0.0, 10);
    });

    it("rises linearly in first quarter", () => {
      // Check linear rise from 0.0 to 1.0
      expect(tri(0.0)).toBe(0.0);
      expect(tri(0.05)).toBeCloseTo(0.2, 10);
      expect(tri(0.1)).toBeCloseTo(0.4, 10);
      expect(tri(0.15)).toBeCloseTo(0.6, 10);
      expect(tri(0.2)).toBeCloseTo(0.8, 10);
      expect(tri(0.25)).toBe(1.0);
    });

    it("descends linearly through middle half", () => {
      // Check linear descent from 1.0 to -1.0
      expect(tri(0.25)).toBe(1.0);
      expect(tri(0.375)).toBeCloseTo(0.5, 10);
      expect(tri(0.5)).toBeCloseTo(0.0, 10);
      expect(tri(0.625)).toBeCloseTo(-0.5, 10);
      expect(tri(0.75)).toBe(-1.0);
    });

    it("rises linearly in last quarter", () => {
      // Check linear rise from -1.0 to 0.0
      expect(tri(0.75)).toBe(-1.0);
      expect(tri(0.8)).toBeCloseTo(-0.8, 10);
      expect(tri(0.85)).toBeCloseTo(-0.6, 10);
      expect(tri(0.9)).toBeCloseTo(-0.4, 10);
      expect(tri(0.95)).toBeCloseTo(-0.2, 10);
    });

    it("handles phase > 1.0 (wraps around)", () => {
      expect(tri(1.25)).toBeCloseTo(tri(0.25), 10);
      expect(tri(2.0)).toBeCloseTo(tri(0.0), 10);
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
    it("starts at 0.0 at phase 0", () => {
      expect(saw(0)).toBe(0.0);
    });

    it("reaches 0.5 at phase 0.25", () => {
      expect(saw(0.25)).toBeCloseTo(0.5, 10);
    });

    it("approaches 1.0 just before phase 0.5", () => {
      expect(saw(0.499)).toBeCloseTo(1.0, 1);
    });

    it("jumps to -1.0 at phase 0.5", () => {
      expect(saw(0.5)).toBe(-1.0);
    });

    it("reaches -0.5 at phase 0.75", () => {
      expect(saw(0.75)).toBeCloseTo(-0.5, 10);
    });

    it("returns to 0.0 at phase 1.0", () => {
      expect(saw(1.0)).toBe(0.0);
    });

    it("rises linearly in each half", () => {
      // First half: 0 → ~1
      expect(saw(0.0)).toBe(0.0);
      expect(saw(0.125)).toBeCloseTo(0.25, 10);
      expect(saw(0.25)).toBeCloseTo(0.5, 10);
      expect(saw(0.375)).toBeCloseTo(0.75, 10);
      // Second half: -1 → 0
      expect(saw(0.5)).toBe(-1.0);
      expect(saw(0.625)).toBeCloseTo(-0.75, 10);
      expect(saw(0.75)).toBeCloseTo(-0.5, 10);
      expect(saw(0.875)).toBeCloseTo(-0.25, 10);
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

  describe("rand()", () => {
    it("returns a value in range [-1.0, 1.0] with default range", () => {
      for (let i = 0; i < 100; i++) {
        const value = rand(-1, 1);

        expect(value).toBeGreaterThanOrEqual(-1.0);
        expect(value).toBeLessThanOrEqual(1.0);
      }
    });

    it("returns a value in range [0, max]", () => {
      for (let i = 0; i < 100; i++) {
        const value = rand(0, 12);

        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(12);
      }
    });

    it("returns a value in range [min, max]", () => {
      for (let i = 0; i < 100; i++) {
        const value = rand(-12, 12);

        expect(value).toBeGreaterThanOrEqual(-12);
        expect(value).toBeLessThanOrEqual(12);
      }
    });

    it("returns different values on each call (non-deterministic)", () => {
      const values = new Set();

      for (let i = 0; i < 100; i++) {
        values.add(rand(-1, 1));
      }

      expect(values.size).toBeGreaterThan(90);
    });

    it("generates values across the full range", () => {
      let hasPositive = false;
      let hasNegative = false;

      for (let i = 0; i < 100; i++) {
        const value = rand(-1, 1);

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

  describe("choose()", () => {
    it("returns the only value from single-element array", () => {
      expect(choose([42])).toBe(42);
    });

    it("returns only values from the provided options", () => {
      const options = [60, 80, 100];

      for (let i = 0; i < 100; i++) {
        expect(options).toContain(choose(options));
      }
    });

    it("selects diverse values from options", () => {
      const options = [1, 2, 3, 4, 5];
      const seen = new Set<number>();

      for (let i = 0; i < 200; i++) {
        seen.add(choose(options));
      }

      // Should see all options with high probability
      expect(seen.size).toBe(5);
    });
  });

  describe("curve()", () => {
    it("returns start value at phase 0", () => {
      expect(curve(0, 0, 1, 2)).toBe(0);
      expect(curve(0, -1, 1, 0.5)).toBe(-1);
      expect(curve(0, 10, 20, 3)).toBe(10);
    });

    it("reaches end value at phase 1", () => {
      expect(curve(1, 0, 1, 2)).toBe(1);
    });

    it("approaches end value near phase 1", () => {
      expect(curve(0.999, 0, 1, 1)).toBeCloseTo(0.999, 2);
      expect(curve(0.999, 0, 1, 2)).toBeCloseTo(0.998, 2);
    });

    it("with exponent=1 matches linear (same as ramp)", () => {
      expect(curve(0.25, 0, 1, 1)).toBeCloseTo(0.25, 10);
      expect(curve(0.5, 0, 1, 1)).toBeCloseTo(0.5, 10);
      expect(curve(0.75, 0, 1, 1)).toBeCloseTo(0.75, 10);
    });

    it("with exponent=2 has slow start, fast end", () => {
      // phase^2: at 0.5 → 0.25 of range
      expect(curve(0.5, 0, 1, 2)).toBeCloseTo(0.25, 10);
      // Below linear at midpoint
      expect(curve(0.5, 0, 1, 2)).toBeLessThan(0.5);
    });

    it("with exponent=0.5 has fast start, slow end", () => {
      // phase^0.5: at 0.5 → sqrt(0.5) ≈ 0.707
      expect(curve(0.5, 0, 1, 0.5)).toBeCloseTo(Math.sqrt(0.5), 10);
      // Above linear at midpoint
      expect(curve(0.5, 0, 1, 0.5)).toBeGreaterThan(0.5);
    });

    it("supports reverse curve (descending)", () => {
      expect(curve(0, 1, 0, 2)).toBe(1);
      expect(curve(0.5, 1, 0, 2)).toBeCloseTo(0.75, 10);
    });

    it("clamps at end value for phase > 1.0", () => {
      expect(curve(1.5, 0, 1, 2)).toBe(1);
    });

    it("supports arbitrary value ranges", () => {
      // curve from 10 to 20 with exponent 2
      expect(curve(0, 10, 20, 2)).toBe(10);
      expect(curve(0.5, 10, 20, 2)).toBeCloseTo(12.5, 10); // 10 + 10 * 0.25
    });

    it("warns and clamps negative exponent to 0.001", () => {
      const result = curve(0.5, 0, 1, -2);

      expect(result).toBeCloseTo(curve(0.5, 0, 1, 0.001), 2);
      expect(outlet).toHaveBeenCalledWith(
        1,
        "curve() exponent must be > 0, got -2, clamping to 0.001",
      );
    });

    it("warns and clamps zero exponent to 0.001", () => {
      const result = curve(0.5, 0, 1, 0);

      expect(result).toBeCloseTo(curve(0.5, 0, 1, 0.001), 2);
      expect(outlet).toHaveBeenCalledWith(
        1,
        "curve() exponent must be > 0, got 0, clamping to 0.001",
      );
    });
  });

  describe("ramp()", () => {
    it("starts at start value at phase 0", () => {
      expect(ramp(0, 0, 1)).toBe(0);
      expect(ramp(0, -1, 1)).toBe(-1);
      expect(ramp(0, 0.5, 1.5)).toBe(0.5);
    });

    it("reaches end value at phase 1", () => {
      expect(ramp(1, 0, 1)).toBe(1);
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
      expect(ramp(1, -0.5, 0.5)).toBe(0.5); // reaches end value

      expect(ramp(0, 10, 20)).toBe(10);
      expect(ramp(0.5, 10, 20)).toBe(15);
    });

    it("supports speed = 2 (reaches end at midpoint, stays)", () => {
      // Speed 2: reaches end value at phase 0.5, clamped thereafter
      expect(ramp(0, 0, 1, 2)).toBe(0);
      expect(ramp(0.25, 0, 1, 2)).toBe(0.5); // halfway to end
      expect(ramp(0.5, 0, 1, 2)).toBe(1); // reaches end value
      expect(ramp(0.75, 0, 1, 2)).toBe(1); // stays at end value
    });

    it("supports speed = 0.5 (half ramp over period)", () => {
      // Speed 0.5: completes half a ramp over phase 0-1
      expect(ramp(0, 0, 1, 0.5)).toBe(0);
      expect(ramp(0.5, 0, 1, 0.5)).toBe(0.25);
      expect(ramp(1, 0, 1, 0.5)).toBe(0.5); // only reaches halfway
    });

    it("supports speed = 3 (reaches end at 1/3, stays)", () => {
      // Speed 3: reaches end value at phase 1/3, clamped thereafter
      expect(ramp(0, 0, 1, 3)).toBe(0);
      expect(ramp(1 / 3, 0, 1, 3)).toBeCloseTo(1, 10); // reaches end value
      expect(ramp(0.5, 0, 1, 3)).toBeCloseTo(1, 10); // stays at end value
      expect(ramp(2 / 3, 0, 1, 3)).toBeCloseTo(1, 10); // stays at end value
    });

    it("clamps at end value for phase > 1.0", () => {
      expect(ramp(1.25, 0, 1)).toBe(1);
      expect(ramp(2.0, 0, 1)).toBe(1);
      expect(ramp(2.5, 0, 1)).toBe(1);
    });

    it("clamps at end value for phase > 1.0 with speed", () => {
      // Speed 2 with phase > 1 — already clamped
      expect(ramp(1.25, 0, 1, 2)).toBe(1);
    });

    it("uses default speed of 1", () => {
      expect(ramp(0.5, 0, 1)).toBe(0.5);
      expect(ramp(0.5, 0, 1, 1)).toBe(0.5);
    });

    it("warns and clamps negative speed to 0 (returns start value)", () => {
      expect(ramp(0.5, 10, 20, -1)).toBe(10);
      expect(ramp(0.5, 0, 1, -5)).toBe(0);
      expect(outlet).toHaveBeenCalledWith(
        1,
        "ramp() speed must be > 0, got -1, clamping to 0",
      );
    });

    it("warns and clamps zero speed to 0 (returns start value)", () => {
      expect(ramp(0.5, 10, 20, 0)).toBe(10);
      expect(outlet).toHaveBeenCalledWith(
        1,
        "ramp() speed must be > 0, got 0, clamping to 0",
      );
    });
  });
});
