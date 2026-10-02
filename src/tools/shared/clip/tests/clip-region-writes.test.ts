// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { clipRegionWrites, endMovesFirst } from "../clip-region-writes.ts";

const FRESH = { loop_end: 4, end_marker: 4 };

describe("clipRegionWrites", () => {
  it("writes the starts first when they fall before the current ends", () => {
    const writes = clipRegionWrites(FRESH, {
      loop_start: 1,
      loop_end: 5,
      start_marker: 1,
      end_marker: 5,
    });

    expect(Object.entries(writes)).toStrictEqual([
      ["start_marker", 1],
      ["loop_start", 1],
      ["loop_end", 5],
      ["end_marker", 5],
    ]);
  });

  it("moves the ends first when the starts land at or past them", () => {
    const writes = clipRegionWrites(FRESH, {
      loop_start: 4,
      loop_end: 8,
      start_marker: 4,
      end_marker: 8,
    });

    expect(Object.entries(writes)).toStrictEqual([
      ["loop_end", 8],
      ["end_marker", 8],
      ["start_marker", 4],
      ["loop_start", 4],
    ]);
  });

  it("orders the loop brace and the markers separately", () => {
    // The loop starts past the current loop_end; the markers don't.
    const writes = clipRegionWrites(FRESH, {
      loop_start: 8,
      loop_end: 12,
      start_marker: -4,
      end_marker: -2,
    });

    expect(Object.entries(writes)).toStrictEqual([
      ["loop_end", 12],
      ["start_marker", -4],
      ["loop_start", 8],
      ["end_marker", -2],
    ]);
  });
});

describe("endMovesFirst", () => {
  it("is true only when the new start reaches the current end", () => {
    expect(endMovesFirst(3, 4)).toBe(false);
    expect(endMovesFirst(4, 4)).toBe(true);
    expect(endMovesFirst(5, 4)).toBe(true);
    expect(endMovesFirst(null, 4)).toBe(false);
  });
});
