// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  polyfillToReversed,
  polyfillToSorted,
  polyfillToSpliced,
  polyfillWith,
} from "./es2023-array.ts";

describe("ES2023 array polyfill prototype installation", () => {
  // Save original methods
  const origToSorted = Array.prototype.toSorted;
  const origToReversed = Array.prototype.toReversed;
  const origToSpliced = Array.prototype.toSpliced;
  const origWith = Array.prototype.with;

  beforeAll(() => {
    // Remove native methods to allow polyfill installation
    // Cast through unknown to avoid ts-expect-error for intentional delete
    const proto = Array.prototype as unknown as Record<string, unknown>;

    delete proto.toSorted;
    delete proto.toReversed;
    delete proto.toSpliced;
    delete proto.with;
  });

  afterAll(() => {
    // Restore original methods
    Array.prototype.toSorted = origToSorted;
    Array.prototype.toReversed = origToReversed;
    Array.prototype.toSpliced = origToSpliced;
    Array.prototype.with = origWith;
  });

  it("should install polyfills on Array.prototype when methods are missing", async () => {
    // Verify methods were removed
    expect(Array.prototype.toSorted).toBeUndefined();

    // Dynamically re-import to trigger polyfill installation side effects.
    // Using a variable prevents TypeScript from resolving the query-string module.
    const suffix = "?install";

    await import(/* @vite-ignore */ `./es2023-array.ts${suffix}`);

    expect(Array.prototype.toSorted).toBeDefined();
    expect([3, 1, 2].toSorted()).toStrictEqual([1, 2, 3]);
  });

  it("should install toReversed polyfill on Array.prototype", () => {
    expect(Array.prototype.toReversed).toBeDefined();
    expect([1, 2, 3].toReversed()).toStrictEqual([3, 2, 1]);
  });

  it("should install toSpliced polyfill on Array.prototype", () => {
    expect(Array.prototype.toSpliced).toBeDefined();
    expect([1, 2, 3, 4].toSpliced(1, 2)).toStrictEqual([1, 4]);
  });

  it("should install with polyfill on Array.prototype", () => {
    expect(Array.prototype.with).toBeDefined();
    expect([1, 2, 3].with(1, 99)).toStrictEqual([1, 99, 3]);
  });
});

describe("ES2023 array polyfills", () => {
  describe("polyfillToSorted", () => {
    it("should sort without mutating original array", () => {
      const arr = [3, 1, 2];
      const sorted = polyfillToSorted(arr);

      expect(sorted).toStrictEqual([1, 2, 3]);
      expect(arr).toStrictEqual([3, 1, 2]); // Original unchanged
    });

    it("should accept a compare function", () => {
      const arr = [1, 2, 3];
      const sorted = polyfillToSorted(arr, (a, b) => b - a);

      expect(sorted).toStrictEqual([3, 2, 1]);
    });

    it("should return a new array instance", () => {
      const arr = [1, 2, 3];
      const sorted = polyfillToSorted(arr);

      expect(sorted).not.toBe(arr);
    });
  });

  describe("polyfillToReversed", () => {
    it("should reverse without mutating original array", () => {
      const arr = [1, 2, 3];
      const reversed = polyfillToReversed(arr);

      expect(reversed).toStrictEqual([3, 2, 1]);
      expect(arr).toStrictEqual([1, 2, 3]); // Original unchanged
    });

    it("should return a new array instance", () => {
      const arr = [1, 2, 3];
      const reversed = polyfillToReversed(arr);

      expect(reversed).not.toBe(arr);
    });
  });

  describe("polyfillToSpliced", () => {
    it("should remove elements without mutating original", () => {
      const arr = [1, 2, 3, 4, 5];
      const spliced = polyfillToSpliced(arr, 1, 2);

      expect(spliced).toStrictEqual([1, 4, 5]);
      expect(arr).toStrictEqual([1, 2, 3, 4, 5]); // Original unchanged
    });

    it("should insert elements", () => {
      const arr = [1, 2, 5];
      const spliced = polyfillToSpliced(arr, 2, 0, 3, 4);

      expect(spliced).toStrictEqual([1, 2, 3, 4, 5]);
    });

    it("should replace elements", () => {
      const arr = [1, 2, 3];
      const spliced = polyfillToSpliced(arr, 1, 1, 99);

      expect(spliced).toStrictEqual([1, 99, 3]);
    });

    it("should handle missing deleteCount", () => {
      const arr = [1, 2, 3, 4, 5];
      const spliced = polyfillToSpliced(arr, 2);

      expect(spliced).toStrictEqual([1, 2]);
    });

    it("should return a new array instance", () => {
      const arr = [1, 2, 3];
      const spliced = polyfillToSpliced(arr, 0, 0);

      expect(spliced).not.toBe(arr);
    });
  });

  describe("polyfillWith", () => {
    it("should replace element at index without mutating original", () => {
      const arr = [1, 2, 3];
      const result = polyfillWith(arr, 1, 99);

      expect(result).toStrictEqual([1, 99, 3]);
      expect(arr).toStrictEqual([1, 2, 3]); // Original unchanged
    });

    it("should handle negative indices", () => {
      const arr = [1, 2, 3];
      const result = polyfillWith(arr, -1, 99);

      expect(result).toStrictEqual([1, 2, 99]);
    });

    it("should throw RangeError for out of bounds index", () => {
      const arr = [1, 2, 3];

      expect(() => polyfillWith(arr, 5, 99)).toThrow(RangeError);
      expect(() => polyfillWith(arr, -5, 99)).toThrow(RangeError);
    });

    it("should return a new array instance", () => {
      const arr = [1, 2, 3];
      const result = polyfillWith(arr, 0, 1);

      expect(result).not.toBe(arr);
    });
  });
});
