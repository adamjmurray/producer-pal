// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { VALID_SCALE_NAMES } from "#src/tools/constants.ts";
import { parseScale } from "../scale-parsing.ts";
import { SCALE_INTERVALS, scaleIntervalsMask } from "../scale-intervals.ts";

describe("SCALE_INTERVALS", () => {
  it("has the intervals of every scale a caller can name, and no other", () => {
    expect(Object.keys(SCALE_INTERVALS).toSorted()).toStrictEqual(
      [...VALID_SCALE_NAMES].toSorted(),
    );
  });

  it.each(VALID_SCALE_NAMES)(
    "lists %s from the root up, within the octave",
    (name) => {
      const intervals = SCALE_INTERVALS[name];

      expect(intervals[0]).toBe(0);
      expect([...intervals].toSorted((a, b) => a - b)).toStrictEqual([
        ...intervals,
      ]);
      expect(new Set(intervals).size).toBe(intervals.length);
      expect(Math.max(...intervals)).toBeLessThan(12);
    },
  );
});

describe("scaleIntervalsMask", () => {
  it("makes the mask of a scale from its root", () => {
    expect(scaleIntervalsMask(parseScale("C Major"))).toBe(2741);
    // A Minor is C Major's pitch classes.
    expect(scaleIntervalsMask(parseScale("A Minor"))).toBe(2741);
    // D E F# A B
    expect(scaleIntervalsMask(parseScale("D Major Pentatonic"))).toBe(2644);
  });
});
