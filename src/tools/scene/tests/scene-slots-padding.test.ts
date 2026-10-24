// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { leftScenesAt, padScenes } from "../helpers/scene-slots.ts";

/**
 * A live_set stand-in that refuses create_scene after `okCalls` successes.
 * @param sceneCount - How many scenes the Set has
 * @param okCalls - create_scene calls that succeed before one throws
 * @returns The fake live set and its call spy
 */
function fakeLiveSet(sceneCount: number, okCalls = Infinity) {
  let made = 0;
  const call = vi.fn(() => {
    if (made >= okCalls) {
      throw new Error("Live refused");
    }

    made++;
  });
  const liveSet = {
    call,
    getChildIds: () => Array.from({ length: sceneCount }, (_, i) => `id ${i}`),
  } as unknown as LiveAPI;

  return { liveSet, call };
}

describe("padScenes", () => {
  it("reads the scene count itself when the caller didn't", () => {
    const { liveSet, call } = fakeLiveSet(3);

    expect(padScenes(liveSet, 2)).toBe("s3-s4");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("names no scenes when the first create fails", () => {
    const { liveSet } = fakeLiveSet(3, 0);

    expect(() => padScenes(liveSet, 2, 3)).toThrow(/^Live refused$/);
  });

  it("names the scenes made before a create fails", () => {
    const { liveSet } = fakeLiveSet(3, 2);

    expect(() => padScenes(liveSet, 4, 3)).toThrow(
      "Live refused; created s3-s4 to reach it",
    );
  });
});

describe("leftScenesAt", () => {
  it("returns null when none of the scenes are left", () => {
    expect(leftScenesAt(["gone"], ["a", "b"])).toBeNull();
  });

  it("groups adjacent scenes into ranges", () => {
    expect(leftScenesAt(["b", "c", "e"], ["a", "b", "c", "d", "e"])).toBe(
      "s1-s2, s4",
    );
  });
});
