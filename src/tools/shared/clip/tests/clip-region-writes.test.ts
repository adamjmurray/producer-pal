// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { clipRegionWrites, endMovesFirst } from "../clip-region-writes.ts";

const FRESH = { loop_end: 4, end_marker: 4 };

describe("clipRegionWrites", () => {
  it("writes the ends first when they grow, even with the starts inside the clip", () => {
    const writes = clipRegionWrites(FRESH, {
      loop_start: 1,
      loop_end: 5,
      start_marker: 1,
      end_marker: 5,
    });

    expect(Object.entries(writes)).toStrictEqual([
      ["loop_end", 5],
      ["end_marker", 5],
      ["start_marker", 1],
      ["loop_start", 1],
    ]);
  });

  it("writes the starts first when the ends shrink", () => {
    const writes = clipRegionWrites(FRESH, {
      loop_start: -4,
      loop_end: -2,
      start_marker: -4,
      end_marker: -2,
    });

    expect(Object.entries(writes)).toStrictEqual([
      ["start_marker", -4],
      ["loop_start", -4],
      ["loop_end", -2],
      ["end_marker", -2],
    ]);
  });

  it("orders the growing and shrinking ends apart, around the starts", () => {
    // loop_end grows, end_marker shrinks.
    const writes = clipRegionWrites(FRESH, {
      loop_start: 2,
      loop_end: 12,
      start_marker: 1,
      end_marker: 2,
    });

    expect(Object.entries(writes)).toStrictEqual([
      ["loop_end", 12],
      ["start_marker", 1],
      ["loop_start", 2],
      ["end_marker", 2],
    ]);
  });

  // Live also refuses a start_marker at or past loop_end, so growing loop 0..4
  // to loop 2..6 with start 5 only works with loop_end written before it.
  it("grows loop 0..4 to loop 2..6, start 5, end 6 with both ends before the starts", () => {
    const writes = clipRegionWrites(FRESH, {
      loop_start: 2,
      loop_end: 6,
      start_marker: 5,
      end_marker: 6,
    });
    const order = Object.keys(writes);

    expect(order.indexOf("loop_end")).toBeLessThan(
      order.indexOf("start_marker"),
    );
    expect(order.indexOf("end_marker")).toBeLessThan(
      order.indexOf("start_marker"),
    );
    expect(order.indexOf("loop_end")).toBeLessThan(order.indexOf("loop_start"));
  });

  // The mirror: a loop_end or end_marker written at or below the current
  // start_marker is refused, so both starts move down first.
  it("shrinks loop 2..6, start 5, end 6 to loop 0..2, start 1, end 2 with both ends after the starts", () => {
    const writes = clipRegionWrites(
      { loop_end: 6, end_marker: 6 },
      { loop_start: 0, loop_end: 2, start_marker: 1, end_marker: 2 },
    );

    expect(Object.entries(writes)).toStrictEqual([
      ["start_marker", 1],
      ["loop_start", 0],
      ["loop_end", 2],
      ["end_marker", 2],
    ]);
  });
});

describe("endMovesFirst", () => {
  it("is true unless the end is moving down", () => {
    expect(endMovesFirst(5, 4)).toBe(true);
    expect(endMovesFirst(4, 4)).toBe(true);
    expect(endMovesFirst(3, 4)).toBe(false);
    expect(endMovesFirst(null, 4)).toBe(false);
  });
});
