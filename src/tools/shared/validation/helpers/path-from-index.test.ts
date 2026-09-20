// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
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
