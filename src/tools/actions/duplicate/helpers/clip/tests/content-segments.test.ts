// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type ClipMarkers, contentSegments } from "../content-segments.ts";

/**
 * Every segment, for a length short enough to list.
 * @param markers - The clip's markers
 * @param lengthBeats - How long the copy plays
 * @returns The segments in playing order
 */
function segmentsOf(markers: ClipMarkers, lengthBeats: number) {
  return [...contentSegments(markers, lengthBeats)];
}

const LOOPED: ClipMarkers = {
  looping: true,
  loopStart: 0,
  loopEnd: 4,
  startMarker: 0,
};

describe("contentSegments", () => {
  it("cuts a shorter copy inside the first pass", () => {
    expect(segmentsOf(LOOPED, 3)).toStrictEqual([{ from: 0, to: 3, at: 0 }]);
  });

  it("repeats the loop, and cuts the last pass", () => {
    expect(segmentsOf(LOOPED, 10)).toStrictEqual([
      { from: 0, to: 4, at: 0 },
      { from: 0, to: 4, at: 4 },
      { from: 0, to: 2, at: 8 },
    ]);
  });

  it("starts mid-loop, then wraps to the loop start", () => {
    const markers = { ...LOOPED, startMarker: 1 };

    expect(segmentsOf(markers, 9)).toStrictEqual([
      { from: 1, to: 4, at: 0 },
      { from: 0, to: 4, at: 3 },
      { from: 0, to: 2, at: 7 },
    ]);
  });

  it("plays the pre-roll once, then loops", () => {
    const markers = { loopStart: 2, loopEnd: 6, startMarker: 0, looping: true };

    expect(segmentsOf(markers, 11)).toStrictEqual([
      { from: 0, to: 6, at: 0 },
      { from: 2, to: 6, at: 6 },
      { from: 2, to: 3, at: 10 },
    ]);
  });

  it("cuts inside the pre-roll when the copy is shorter than it", () => {
    const markers = { loopStart: 2, loopEnd: 6, startMarker: 0, looping: true };

    expect(segmentsOf(markers, 1.5)).toStrictEqual([
      { from: 0, to: 1.5, at: 0 },
    ]);
  });

  it("plays an unlooped clip on from its start marker", () => {
    const markers = { ...LOOPED, looping: false, startMarker: 1 };

    expect(segmentsOf(markers, 8)).toStrictEqual([{ from: 1, to: 9, at: 0 }]);
  });

  it("has nothing to repeat in an empty loop", () => {
    expect(segmentsOf({ ...LOOPED, loopEnd: 0 }, 8)).toStrictEqual([]);
  });

  it("skips a start marker that sits at or past the loop end", () => {
    expect(segmentsOf({ ...LOOPED, startMarker: 4 }, 6)).toStrictEqual([
      { from: 0, to: 4, at: 0 },
      { from: 0, to: 2, at: 4 },
    ]);
  });

  it("makes segments on demand, so a huge length costs nothing up front", () => {
    const tiny = { ...LOOPED, loopEnd: 0.25 };
    const taken = [...take(contentSegments(tiny, 1e9), 3)];

    expect(taken).toStrictEqual([
      { from: 0, to: 0.25, at: 0 },
      { from: 0, to: 0.25, at: 0.25 },
      { from: 0, to: 0.25, at: 0.5 },
    ]);
  });
});

/**
 * The first few items of an iterator.
 * @param iterator - The source
 * @param count - How many to take
 * @yields The items, then stops
 */
function* take<T>(iterator: Iterator<T>, count: number): Generator<T> {
  for (let i = 0; i < count; i++) {
    const next = iterator.next();

    if (next.done === true) {
      return;
    }

    yield next.value;
  }
}
