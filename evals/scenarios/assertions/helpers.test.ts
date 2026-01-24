import { describe, it, expect } from "vitest";
import {
  partialMatch,
  normalizeCount,
  formatExpectedCount,
} from "./helpers.ts";

describe("partialMatch", () => {
  it("returns true for empty expected object", () => {
    expect(partialMatch({ a: 1, b: 2 }, {})).toBe(true);
  });

  it("returns true when all expected keys match", () => {
    expect(partialMatch({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 })).toBe(true);
  });

  it("returns false when a key value differs", () => {
    expect(partialMatch({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it("returns false when expected key is missing from actual", () => {
    expect(partialMatch({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("ignores undefined values in expected", () => {
    expect(partialMatch({ a: 1 }, { a: 1, b: undefined })).toBe(true);
  });

  it("handles nested objects with partial matching", () => {
    const actual = { outer: { inner: 1, extra: 2 } };
    const expected = { outer: { inner: 1 } };

    expect(partialMatch(actual, expected)).toBe(true);
  });

  it("returns false for mismatched nested objects", () => {
    const actual = { outer: { inner: 1 } };
    const expected = { outer: { inner: 2 } };

    expect(partialMatch(actual, expected)).toBe(false);
  });

  it("handles arrays with exact matching", () => {
    expect(partialMatch({ arr: [1, 2, 3] }, { arr: [1, 2, 3] })).toBe(true);
  });

  it("returns false for arrays with different lengths", () => {
    expect(partialMatch({ arr: [1, 2] }, { arr: [1, 2, 3] })).toBe(false);
  });

  it("returns false for arrays with different elements", () => {
    expect(partialMatch({ arr: [1, 2, 3] }, { arr: [1, 2, 4] })).toBe(false);
  });

  it("handles arrays of objects", () => {
    const actual = {
      items: [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ],
    };
    const expected = { items: [{ id: 1 }, { id: 2 }] };

    expect(partialMatch(actual, expected)).toBe(true);
  });

  it("handles null values correctly", () => {
    expect(partialMatch({ a: null }, { a: null })).toBe(true);
    expect(partialMatch({ a: 1 }, { a: null })).toBe(false);
  });

  it("handles string values", () => {
    expect(partialMatch({ name: "test" }, { name: "test" })).toBe(true);
    expect(partialMatch({ name: "test" }, { name: "other" })).toBe(false);
  });
});

describe("normalizeCount", () => {
  it("returns min: 1 for undefined count", () => {
    expect(normalizeCount(undefined)).toStrictEqual({ min: 1 });
  });

  it("returns min: 1 for null count", () => {
    expect(normalizeCount(null as unknown as undefined)).toStrictEqual({
      min: 1,
    });
  });

  it("returns exact range for number count", () => {
    expect(normalizeCount(3)).toStrictEqual({ min: 3, max: 3 });
  });

  it("returns 0 for zero count", () => {
    expect(normalizeCount(0)).toStrictEqual({ min: 0, max: 0 });
  });

  it("preserves range object with both min and max", () => {
    expect(normalizeCount({ min: 2, max: 5 })).toStrictEqual({
      min: 2,
      max: 5,
    });
  });

  it("defaults min to 1 when only max provided", () => {
    expect(normalizeCount({ max: 5 })).toStrictEqual({ min: 1, max: 5 });
  });

  it("preserves undefined max when only min provided", () => {
    expect(normalizeCount({ min: 2 })).toStrictEqual({
      min: 2,
      max: undefined,
    });
  });
});

describe("formatExpectedCount", () => {
  it("formats 'at least N' when max is undefined", () => {
    expect(formatExpectedCount({ min: 1 })).toBe("at least 1 time(s)");
    expect(formatExpectedCount({ min: 3 })).toBe("at least 3 time(s)");
  });

  it("formats 'exactly N' when min equals max", () => {
    expect(formatExpectedCount({ min: 1, max: 1 })).toBe("exactly 1 time(s)");
    expect(formatExpectedCount({ min: 5, max: 5 })).toBe("exactly 5 time(s)");
  });

  it("formats range when min differs from max", () => {
    expect(formatExpectedCount({ min: 2, max: 5 })).toBe("2-5 time(s)");
    expect(formatExpectedCount({ min: 1, max: 3 })).toBe("1-3 time(s)");
  });

  it("handles zero values", () => {
    expect(formatExpectedCount({ min: 0, max: 0 })).toBe("exactly 0 time(s)");
    expect(formatExpectedCount({ min: 0, max: 2 })).toBe("0-2 time(s)");
  });
});
