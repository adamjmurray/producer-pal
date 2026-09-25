// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  newTrackPathFromCount,
  newTrackPathFromIndex,
  scenePathFromIndex,
  trackCategoryPath,
  trackPathFromIndex,
} from "./path-from-index.ts";

describe("trackPathFromIndex", () => {
  it.each([
    [{ trackIndex: 3 }, "t3"],
    [{ trackIndex: 0 }, "t0"],
    [{ trackIndex: 1, trackType: "return" }, "rt1"],
    [{ trackIndex: -1 }, "t+"],
    [{ trackIndex: -1, trackType: "return" }, "rt+"],
    [{ trackType: "master" }, "mt"],
    // The main track has one path, whatever index came with it.
    [{ trackIndex: 2, trackType: "master" }, "mt"],
  ])("spells %o as %s", (args, path) => {
    expect(trackPathFromIndex(args)).toBe(path);
  });

  it.each([[{}], [{ trackIndex: "3" }], [{ trackType: "regular" }]])(
    "gives no path for %o",
    (args) => {
      expect(trackPathFromIndex(args)).toBeUndefined();
    },
  );
});

describe("newTrackPathFromIndex", () => {
  it.each([
    [{ trackIndex: 2 }, "t2"],
    [{ trackIndex: -1, type: "midi" }, "t+"],
    [{ trackIndex: 2, type: "return" }, "rt+"],
    // trackType is another tool's param; create-track ignores it.
    [{ trackIndex: 2, trackType: "return" }, "t2"],
    // count repeats the one place, so the path names it once per track.
    [{ trackIndex: 2, count: 3 }, "t2,t2,t2"],
    // Too many to list: count's own warning says to repeat it.
    [{ trackIndex: 2, count: 6 }, "t2"],
  ])("spells %o as %s", (args, path) => {
    expect(newTrackPathFromIndex(args)).toBe(path);
  });
});

describe("newTrackPathFromCount", () => {
  it.each([
    [{ count: 2 }, "t+,t+"],
    [{ count: 2, type: "return" }, "rt+,rt+"],
    [{ trackIndex: 2, count: 3 }, "t2,t2,t2"],
    [{ path: "rt+", count: 2 }, "rt+,rt+"],
    [{ path: "t2", count: 3, type: "audio" }, "t2,t2,t2"],
    [{ count: 5 }, "t+,t+,t+,t+,t+"],
    // A path the tool reads as unsent leaves the index to name the place.
    [{ path: "", trackIndex: 2, count: 3 }, "t2,t2,t2"],
    [{ path: "null", trackIndex: 2, count: 3 }, "t2,t2,t2"],
    [{ path: " t2 ", count: 2 }, "t2,t2"],
  ])("spells %o as %s", (args, path) => {
    expect(newTrackPathFromCount(args)).toBe(path);
  });

  it.each([
    [{ count: 6 }],
    // count with a path list is refused, so no list reproduces it.
    [{ path: "t+,t+", count: 2 }],
  ])("gives no example for %o", (args) => {
    expect(newTrackPathFromCount(args)).toBeUndefined();
  });
});

describe("trackCategoryPath", () => {
  it.each([
    ["regular", 2, "t2"],
    ["return", 0, "rt0"],
    ["master", 0, "mt"],
    ["regular", -1, "t+"],
  ])("spells %s %d as %s", (category, index, path) => {
    expect(trackCategoryPath(category, index)).toBe(path);
  });
});

describe("scenePathFromIndex", () => {
  it("spells a scene index as its path", () => {
    expect(scenePathFromIndex({ sceneIndex: 3 })).toBe("s3");
  });

  it("gives no path without a sceneIndex", () => {
    expect(scenePathFromIndex({})).toBeUndefined();
  });
});
