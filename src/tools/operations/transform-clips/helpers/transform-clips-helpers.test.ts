// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  createSeededRNG,
  parseTransposeValues,
  randomInRange,
} from "./transform-clips-helpers.ts";
import {
  calculateShufflePositions,
  shuffleArray,
} from "./transform-clips-shuffling-helpers.ts";

describe("transform-clips helpers", () => {
  describe("parseTransposeValues", () => {
    it("returns null when transposeValues is null", () => {
      expect(parseTransposeValues(undefined)).toBeNull();
    });

    it("returns null when transposeValues is undefined", () => {
      expect(parseTransposeValues()).toBeNull();
    });

    it("parses comma-separated transpose values", () => {
      expect(parseTransposeValues("1,2,3")).toStrictEqual([1, 2, 3]);
    });

    it("parses negative transpose values", () => {
      expect(parseTransposeValues("-5, -3, -1")).toStrictEqual([-5, -3, -1]);
    });

    it("parses mixed positive and negative values", () => {
      expect(parseTransposeValues("-12, 0, 7")).toStrictEqual([-12, 0, 7]);
    });

    it("filters out invalid numbers", () => {
      expect(parseTransposeValues("1, abc, 3")).toStrictEqual([1, 3]);
    });

    it("handles whitespace around values", () => {
      expect(parseTransposeValues("  1 ,  2  ,  3  ")).toStrictEqual([1, 2, 3]);
    });

    it("throws when all values are invalid (empty result)", () => {
      expect(() => parseTransposeValues("abc, def, ghi")).toThrow(
        "transposeValues must contain at least one valid number",
      );
    });

    it("throws when string is just commas (empty result)", () => {
      expect(() => parseTransposeValues(",,,")).toThrow(
        "transposeValues must contain at least one valid number",
      );
    });

    it("logs warning when transposeMin is provided", () => {
      parseTransposeValues("1,2,3", 0);
      expect(outlet).toHaveBeenCalledWith(
        1,
        "transposeValues ignores transposeMin/transposeMax",
      );
    });

    it("logs warning when transposeMax is provided", () => {
      parseTransposeValues("1,2,3", undefined, 12);
      expect(outlet).toHaveBeenCalledWith(
        1,
        "transposeValues ignores transposeMin/transposeMax",
      );
    });

    it("logs warning when both transposeMin and transposeMax are provided", () => {
      parseTransposeValues("1,2,3", -5, 5);
      expect(outlet).toHaveBeenCalledWith(
        1,
        "transposeValues ignores transposeMin/transposeMax",
      );
    });

    it("parses decimal transpose values", () => {
      expect(parseTransposeValues("0.5, 1.25, -0.75")).toStrictEqual([
        0.5, 1.25, -0.75,
      ]);
    });

    it("handles single value", () => {
      expect(parseTransposeValues("7")).toStrictEqual([7]);
    });
  });

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

      expect(shuffled.sort()).toStrictEqual(input.sort());
    });

    it("generates consistent shuffle with same seed", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(12345);
      const input = [1, 2, 3, 4, 5, 6, 7, 8];

      const shuffled1 = shuffleArray(input, rng1);
      const shuffled2 = shuffleArray(input, rng2);

      expect(shuffled1).toStrictEqual(shuffled2);
    });

    it("generates different shuffle with different seed", () => {
      const rng1 = createSeededRNG(12345);
      const rng2 = createSeededRNG(54321);
      const input = [1, 2, 3, 4, 5, 6, 7, 8];

      const shuffled1 = shuffleArray(input, rng1);
      const shuffled2 = shuffleArray(input, rng2);

      expect(shuffled1).not.toStrictEqual(shuffled2);
    });

    it("does not modify original array", () => {
      const rng = createSeededRNG(12345);
      const input = [1, 2, 3, 4, 5];
      const inputCopy = [...input];

      shuffleArray(input, rng);

      expect(input).toStrictEqual(inputCopy);
    });

    it("handles single element array", () => {
      const rng = createSeededRNG(12345);
      const input = [42];
      const shuffled = shuffleArray(input, rng);

      expect(shuffled).toStrictEqual([42]);
    });

    it("handles empty array", () => {
      const rng = createSeededRNG(12345);
      const input: number[] = [];
      const shuffled = shuffleArray(input, rng);

      expect(shuffled).toStrictEqual([]);
    });

    it("handles array with duplicate values", () => {
      const rng = createSeededRNG(12345);
      const input = [1, 1, 2, 2, 3, 3];
      const shuffled = shuffleArray(input, rng);

      expect(shuffled).toHaveLength(6);
      expect(shuffled.sort()).toStrictEqual([1, 1, 2, 2, 3, 3]);
    });
  });

  describe("calculateShufflePositions", () => {
    it("handles back-to-back clips with same length", () => {
      // A(1bar)@0, B(1bar)@1, C(1bar)@2 - no gaps
      const clips = [
        { startTime: 0, length: 1 },
        { startTime: 1, length: 1 },
        { startTime: 2, length: 1 },
      ];
      // Shuffle to: C, A, B (indices 2, 0, 1)
      const positions = calculateShufflePositions(clips, [2, 0, 1]);

      // All same length, so positions stay [0, 1, 2]
      expect(positions).toStrictEqual([0, 1, 2]);
    });

    it("handles back-to-back clips with different lengths", () => {
      // A(1bar)@0, B(1bar)@1, C(2bars)@2 - no gaps
      const clips = [
        { startTime: 0, length: 1 },
        { startTime: 1, length: 1 },
        { startTime: 2, length: 2 },
      ];
      // Shuffle to: C, A, B (indices 2, 0, 1)
      const positions = calculateShufflePositions(clips, [2, 0, 1]);

      // C(2)@0, A(1)@2, B(1)@3
      expect(positions).toStrictEqual([0, 2, 3]);
    });

    it("preserves gaps between clips", () => {
      // A(1bar)@0, B(1bar)@4, C(2bars)@8 - gaps of 3 each
      const clips = [
        { startTime: 0, length: 1 },
        { startTime: 4, length: 1 },
        { startTime: 8, length: 2 },
      ];
      // Shuffle to: C, A, B (indices 2, 0, 1)
      const positions = calculateShufflePositions(clips, [2, 0, 1]);

      // C(2)@0 ends@2, +gap3 → A(1)@5 ends@6, +gap3 → B(1)@9
      expect(positions).toStrictEqual([0, 5, 9]);
    });

    it("preserves mixed gap pattern", () => {
      // A(1bar)@0, B(2bars)@3, C(1bar)@5 - gaps of 2 then 0
      const clips = [
        { startTime: 0, length: 1 },
        { startTime: 3, length: 2 },
        { startTime: 5, length: 1 },
      ];
      // Shuffle to: B, C, A (indices 1, 2, 0)
      const positions = calculateShufflePositions(clips, [1, 2, 0]);

      // B(2)@0 ends@2, +gap2 → C(1)@4 ends@5, +gap0 → A(1)@5
      expect(positions).toStrictEqual([0, 4, 5]);
    });

    it("handles no shuffle (same order)", () => {
      const clips = [
        { startTime: 0, length: 1 },
        { startTime: 4, length: 2 },
        { startTime: 8, length: 1 },
      ];
      // Same order: indices 0, 1, 2
      const positions = calculateShufflePositions(clips, [0, 1, 2]);

      // Should return original positions
      expect(positions).toStrictEqual([0, 4, 8]);
    });

    it("handles two clips", () => {
      const clips = [
        { startTime: 0, length: 2 },
        { startTime: 4, length: 1 },
      ];
      // Swap: indices 1, 0
      const positions = calculateShufflePositions(clips, [1, 0]);

      // B(1)@0 ends@1, +gap2 → A(2)@3
      expect(positions).toStrictEqual([0, 3]);
    });
  });
});
