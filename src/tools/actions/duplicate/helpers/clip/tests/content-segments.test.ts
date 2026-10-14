// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type ClipMarkers, contentSegments } from "../content-segments.ts";

const LOOPED: ClipMarkers = {
  looping: true,
  loopStart: 0,
  loopEnd: 4,
  startMarker: 0,
};

describe("contentSegments", () => {
  it("cuts a shorter copy inside the first pass", () => {
    expect(contentSegments(LOOPED, 3)).toStrictEqual([
      { from: 0, to: 3, at: 0 },
    ]);
  });

  it("repeats the loop, and cuts the last pass", () => {
    expect(contentSegments(LOOPED, 10)).toStrictEqual([
      { from: 0, to: 4, at: 0 },
      { from: 0, to: 4, at: 4 },
      { from: 0, to: 2, at: 8 },
    ]);
  });

  it("starts mid-loop, then wraps to the loop start", () => {
    const markers = { ...LOOPED, startMarker: 1 };

    expect(contentSegments(markers, 9)).toStrictEqual([
      { from: 1, to: 4, at: 0 },
      { from: 0, to: 4, at: 3 },
      { from: 0, to: 2, at: 7 },
    ]);
  });

  it("plays the pre-roll once, then loops", () => {
    const markers = { loopStart: 2, loopEnd: 6, startMarker: 0, looping: true };

    expect(contentSegments(markers, 11)).toStrictEqual([
      { from: 0, to: 6, at: 0 },
      { from: 2, to: 6, at: 6 },
      { from: 2, to: 3, at: 10 },
    ]);
  });

  it("cuts inside the pre-roll when the copy is shorter than it", () => {
    const markers = { loopStart: 2, loopEnd: 6, startMarker: 0, looping: true };

    expect(contentSegments(markers, 1.5)).toStrictEqual([
      { from: 0, to: 1.5, at: 0 },
    ]);
  });

  it("plays an unlooped clip on from its start marker", () => {
    const markers = { ...LOOPED, looping: false, startMarker: 1 };

    expect(contentSegments(markers, 8)).toStrictEqual([
      { from: 1, to: 9, at: 0 },
    ]);
  });

  it("has nothing to repeat in an empty loop", () => {
    expect(contentSegments({ ...LOOPED, loopEnd: 0 }, 8)).toStrictEqual([]);
  });

  it("skips a start marker that sits at or past the loop end", () => {
    expect(contentSegments({ ...LOOPED, startMarker: 4 }, 6)).toStrictEqual([
      { from: 0, to: 4, at: 0 },
      { from: 0, to: 2, at: 4 },
    ]);
  });
});
