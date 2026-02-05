// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  getTargetTurns,
  partialMatch,
  exactMatch,
  normalizeCount,
  formatExpectedCount,
} from "./helpers.ts";
import type { EvalTurnResult } from "../types.ts";

describe("getTargetTurns", () => {
  const mockTurns: EvalTurnResult[] = [
    {
      turnIndex: 0,
      userMessage: "first",
      assistantResponse: "a",
      toolCalls: [],
      durationMs: 100,
    },
    {
      turnIndex: 1,
      userMessage: "second",
      assistantResponse: "b",
      toolCalls: [],
      durationMs: 200,
    },
  ];

  it("returns all turns for 'any'", () => {
    expect(getTargetTurns(mockTurns, "any")).toStrictEqual(mockTurns);
  });

  it("returns all turns for undefined", () => {
    expect(getTargetTurns(mockTurns, undefined)).toStrictEqual(mockTurns);
  });

  it("returns specific turn by index", () => {
    expect(getTargetTurns(mockTurns, 1)).toStrictEqual([mockTurns[1]]);
  });

  it("returns first turn when index is 0", () => {
    expect(getTargetTurns(mockTurns, 0)).toStrictEqual([mockTurns[0]]);
  });

  it("returns empty array for out-of-bounds index", () => {
    expect(getTargetTurns(mockTurns, 5)).toStrictEqual([]);
  });

  it("returns empty array for negative index", () => {
    expect(getTargetTurns(mockTurns, -1)).toStrictEqual([]);
  });

  it("handles empty turns array", () => {
    expect(getTargetTurns([], "any")).toStrictEqual([]);
    expect(getTargetTurns([], 0)).toStrictEqual([]);
  });
});

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

describe("partialMatch with vitest matchers", () => {
  it("matches expect.any(String) for string values", () => {
    expect(
      partialMatch(
        { sessionId: "abc-123-xyz" },
        { sessionId: expect.any(String) },
      ),
    ).toBe(true);
  });

  it("fails expect.any(String) for non-string values", () => {
    expect(
      partialMatch({ sessionId: 12345 }, { sessionId: expect.any(String) }),
    ).toBe(false);
  });

  it("matches expect.any(Number) for number values", () => {
    expect(partialMatch({ count: 42 }, { count: expect.any(Number) })).toBe(
      true,
    );
  });

  it("matches expect.anything() for any non-null value", () => {
    expect(partialMatch({ value: "test" }, { value: expect.anything() })).toBe(
      true,
    );
    expect(partialMatch({ value: 123 }, { value: expect.anything() })).toBe(
      true,
    );
    expect(partialMatch({ value: {} }, { value: expect.anything() })).toBe(
      true,
    );
  });

  it("fails expect.anything() for null/undefined", () => {
    expect(partialMatch({ value: null }, { value: expect.anything() })).toBe(
      false,
    );
  });

  it("matches expect.stringContaining() for partial strings", () => {
    expect(
      partialMatch(
        { message: "Hello World" },
        { message: expect.stringContaining("World") },
      ),
    ).toBe(true);
  });

  it("fails expect.stringContaining() when substring not found", () => {
    expect(
      partialMatch(
        { message: "Hello World" },
        { message: expect.stringContaining("Foo") },
      ),
    ).toBe(false);
  });

  it("matches expect.stringMatching() with regex", () => {
    expect(
      partialMatch(
        { id: "session-abc-123" },
        { id: expect.stringMatching(/^session-[a-z]+-\d+$/) },
      ),
    ).toBe(true);
  });

  it("matches expect.objectContaining() for nested objects", () => {
    expect(
      partialMatch(
        { options: { enabled: true, mode: "fast", extra: "ignored" } },
        { options: expect.objectContaining({ enabled: true }) },
      ),
    ).toBe(true);
  });

  it("fails expect.objectContaining() when key missing", () => {
    expect(
      partialMatch(
        { options: { mode: "fast" } },
        { options: expect.objectContaining({ enabled: true }) },
      ),
    ).toBe(false);
  });

  it("matches expect.arrayContaining() for arrays", () => {
    expect(
      partialMatch(
        { tracks: [1, 2, 3, 4, 5] },
        { tracks: expect.arrayContaining([2, 4]) },
      ),
    ).toBe(true);
  });

  it("fails expect.arrayContaining() when elements missing", () => {
    expect(
      partialMatch(
        { tracks: [1, 2, 3] },
        { tracks: expect.arrayContaining([2, 4]) },
      ),
    ).toBe(false);
  });

  it("supports mixing matchers with literal values", () => {
    expect(
      partialMatch(
        { name: "Test", id: "abc-123", count: 5 },
        { name: "Test", id: expect.any(String), count: expect.any(Number) },
      ),
    ).toBe(true);
  });

  it("supports nested matchers in objects", () => {
    expect(
      partialMatch(
        { outer: { inner: { value: "test-value" } } },
        {
          outer: expect.objectContaining({
            inner: expect.objectContaining({
              value: expect.stringContaining("test"),
            }),
          }),
        },
      ),
    ).toBe(true);
  });

  it("supports matchers inside arrays", () => {
    expect(
      partialMatch(
        { items: [{ id: "abc" }, { id: "xyz" }] },
        { items: [{ id: expect.any(String) }, { id: expect.any(String) }] },
      ),
    ).toBe(true);
  });
});

describe("exactMatch", () => {
  it("returns true for empty actual and empty expected", () => {
    expect(exactMatch({}, {})).toBe(true);
  });

  it("returns false when actual has extra keys", () => {
    expect(exactMatch({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it("returns false when actual is missing keys", () => {
    expect(exactMatch({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("returns true when keys match exactly", () => {
    expect(exactMatch({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it("returns false when values differ", () => {
    expect(exactMatch({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("ignores undefined values in expected", () => {
    expect(exactMatch({ a: 1 }, { a: 1, b: undefined })).toBe(true);
  });

  it("supports matchers for values", () => {
    expect(exactMatch({ id: "abc-123" }, { id: expect.any(String) })).toBe(
      true,
    );
  });

  it("fails when actual has extra keys even with matchers", () => {
    expect(
      exactMatch({ id: "abc-123", extra: "value" }, { id: expect.any(String) }),
    ).toBe(false);
  });

  it("supports expect.objectContaining() for partial matching", () => {
    expect(
      exactMatch(
        { id: "abc-123", extra: "value" },
        expect.objectContaining({ id: "abc-123" }) as Record<string, unknown>,
      ),
    ).toBe(true);
  });

  it("fails expect.objectContaining() when key missing", () => {
    expect(
      exactMatch(
        { extra: "value" },
        expect.objectContaining({ id: "abc-123" }) as Record<string, unknown>,
      ),
    ).toBe(false);
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
