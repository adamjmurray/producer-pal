import { describe, expect, it } from "vitest";
import {
  createSeededRNG,
  randomInRange,
} from "./transform-clips-helpers.js";
import { shuffleArray } from "./transform-clips-shuffling-helpers.js";

describe("transform-clips helpers", () => {
  describe("createSeededRNG", () => {
    it("generates consistent random numbers with same seed", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(12345);

      expect(rng1()).toBe(rng2());
      expect(rng1()).toBe(rng2());
      expect(rng1()).toBe(rng2());
    });

    it("generates different sequences with different seeds", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(54321);

      expect(rng1()).not.toBe(rng2());
    });

    it("generates numbers between 0 and 1", () => {
      const rng = createSeededRNG(12345);

      for (let i = 0; i < 100; i++) {
        const value = rng();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it("generates different values on successive calls", () => {
      const rng = createSeededRNG(12345);

      const value1 = rng();
      const value2 = rng();
      const value3 = rng();

      expect(value1).not.toBe(value2);
      expect(value2).not.toBe(value3);
      expect(value1).not.toBe(value3);
    });
  });

  describe("randomInRange", () => {
    it("generates numbers within specified range", () => {
      const rng = createSeededRNG(12345);

      for (let i = 0; i < 100; i++) {
        const value = randomInRange(10, 20, rng);
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThanOrEqual(20);
      }
    });

    it("generates consistent values with same RNG state", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(12345);

      expect(randomInRange(5, 15, rng1)).toBe(randomInRange(5, 15, rng2));
    });

    it("handles negative ranges", () => {
      const rng = createSeededRNG(12345);

      for (let i = 0; i < 100; i++) {
        const value = randomInRange(-10, -5, rng);
        expect(value).toBeGreaterThanOrEqual(-10);
        expect(value).toBeLessThanOrEqual(-5);
      }
    });

    it("handles range crossing zero", () => {
      const rng = createSeededRNG(12345);

      for (let i = 0; i < 100; i++) {
        const value = randomInRange(-5, 5, rng);
        expect(value).toBeGreaterThanOrEqual(-5);
        expect(value).toBeLessThanOrEqual(5);
      }
    });

    it("returns min when min equals max", () => {
      const rng = createSeededRNG(12345);
      const value = randomInRange(42, 42, rng);
      expect(value).toBe(42);
    });
  });

  describe("shuffleArray", () => {
    it("returns array of same length", () => {
      const rng = createSeededRNG(12345);
      const input = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(input, rng);

      expect(shuffled).toHaveLength(input.length);
    });

    it("contains all original elements", () => {
      const rng = createSeededRNG(12345);
      const input = [1, 2, 3, 4, 5];
      const shuffled = shuffleArray(input, rng);

      expect(shuffled.sort()).toEqual(input.sort());
    });

    it("generates consistent shuffle with same seed", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(12345);
      const input = [1, 2, 3, 4, 5, 6, 7, 8];

      const shuffled1 = shuffleArray(input, rng1);
      const shuffled2 = shuffleArray(input, rng2);

      expect(shuffled1).toEqual(shuffled2);
    });

    it("generates different shuffle with different seed", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(54321);
      const input = [1, 2, 3, 4, 5, 6, 7, 8];

      const shuffled1 = shuffleArray(input, rng1);
      const shuffled2 = shuffleArray(input, rng2);

      expect(shuffled1).not.toEqual(shuffled2);
    });

    it("does not modify original array", () => {
      const rng = createSeededRNG(12345);
      const input = [1, 2, 3, 4, 5];
      const inputCopy = [...input];

      shuffleArray(input, rng);

      expect(input).toEqual(inputCopy);
    });

    it("handles single element array", () => {
      const rng = createSeededRNG(12345);
      const input = [42];
      const shuffled = shuffleArray(input, rng);

      expect(shuffled).toEqual([42]);
    });

    it("handles empty array", () => {
      const rng = createSeededRNG(12345);
      const input = [];
      const shuffled = shuffleArray(input, rng);

      expect(shuffled).toEqual([]);
    });

    it("handles array with duplicate values", () => {
      const rng = createSeededRNG(12345);
      const input = [1, 1, 2, 2, 3, 3];
      const shuffled = shuffleArray(input, rng);

      expect(shuffled).toHaveLength(6);
      expect(shuffled.sort()).toEqual([1, 1, 2, 2, 3, 3]);
    });
  });
});
