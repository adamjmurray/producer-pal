import { describe, expect, it } from "vitest";
import {
  createSeededRNG,
  randomInRange,
  shuffleArray,
} from "./transform-clips.js";

describe("transform-clips - helper functions", () => {
  describe("createSeededRNG", () => {
    it("generates consistent random numbers with the same seed", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(12345);

      const values1 = [rng1(), rng1(), rng1()];
      const values2 = [rng2(), rng2(), rng2()];

      expect(values1).toEqual(values2);
    });

    it("generates different sequences with different seeds", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(54321);

      const values1 = [rng1(), rng1(), rng1()];
      const values2 = [rng2(), rng2(), rng2()];

      expect(values1).not.toEqual(values2);
    });

    it("generates values between 0 and 1", () => {
      const rng = createSeededRNG(42);

      for (let i = 0; i < 100; i++) {
        const value = rng();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });

    it("generates different values on subsequent calls", () => {
      const rng = createSeededRNG(12345);

      const value1 = rng();
      const value2 = rng();
      const value3 = rng();

      expect(value1).not.toBe(value2);
      expect(value2).not.toBe(value3);
    });
  });

  describe("randomInRange", () => {
    it("generates values within the specified range", () => {
      const rng = createSeededRNG(12345);
      const min = 10;
      const max = 20;

      for (let i = 0; i < 100; i++) {
        const value = randomInRange(min, max, rng);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
      }
    });

    it("returns min when RNG returns 0", () => {
      const mockRng = () => 0;
      const result = randomInRange(10, 20, mockRng);
      expect(result).toBe(10);
    });

    it("returns max when RNG returns 1", () => {
      const mockRng = () => 1;
      const result = randomInRange(10, 20, mockRng);
      expect(result).toBe(20);
    });

    it("handles negative ranges", () => {
      const rng = createSeededRNG(42);
      const min = -10;
      const max = -5;

      const value = randomInRange(min, max, rng);
      expect(value).toBeGreaterThanOrEqual(min);
      expect(value).toBeLessThanOrEqual(max);
    });

    it("generates consistent values with seeded RNG", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(12345);

      const value1 = randomInRange(0, 100, rng1);
      const value2 = randomInRange(0, 100, rng2);

      expect(value1).toBe(value2);
    });
  });

  describe("shuffleArray", () => {
    it("returns an array with the same length", () => {
      const rng = createSeededRNG(12345);
      const original = [1, 2, 3, 4, 5];

      const shuffled = shuffleArray(original, rng);

      expect(shuffled).toHaveLength(original.length);
    });

    it("returns an array with the same elements", () => {
      const rng = createSeededRNG(12345);
      const original = [1, 2, 3, 4, 5];

      const shuffled = shuffleArray(original, rng);

      expect(shuffled.sort()).toEqual(original.sort());
    });

    it("does not modify the original array", () => {
      const rng = createSeededRNG(12345);
      const original = [1, 2, 3, 4, 5];
      const originalCopy = [...original];

      shuffleArray(original, rng);

      expect(original).toEqual(originalCopy);
    });

    it("produces consistent shuffles with the same seed", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(12345);
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const shuffled1 = shuffleArray(array, rng1);
      const shuffled2 = shuffleArray(array, rng2);

      expect(shuffled1).toEqual(shuffled2);
    });

    it("produces different shuffles with different seeds", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(54321);
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const shuffled1 = shuffleArray(array, rng1);
      const shuffled2 = shuffleArray(array, rng2);

      expect(shuffled1).not.toEqual(shuffled2);
    });

    it("handles empty arrays", () => {
      const rng = createSeededRNG(12345);
      const empty = [];

      const shuffled = shuffleArray(empty, rng);

      expect(shuffled).toEqual([]);
    });

    it("handles single-element arrays", () => {
      const rng = createSeededRNG(12345);
      const single = [42];

      const shuffled = shuffleArray(single, rng);

      expect(shuffled).toEqual([42]);
    });

    it("actually shuffles arrays (not always returning original order)", () => {
      const rng = createSeededRNG(12345);
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const shuffled = shuffleArray(array, rng);

      // With a good RNG, it's highly unlikely to get the original order
      // This test might occasionally fail with very bad luck, but probability is low
      expect(shuffled).not.toEqual(array);
    });
  });
});
