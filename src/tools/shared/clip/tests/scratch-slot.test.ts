// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { withScratchSlot } from "#src/tools/shared/clip/scratch-slot.ts";

/**
 * A Live Set whose track 0 has one slot per entry, holding a clip or not.
 * @param hasClips - has_clip for each of track 0's slots
 * @returns The Live Set
 */
function registerTrack(hasClips: number[]): RegisteredMockObject {
  const ids = hasClips.map((_, i) => `slot${i}`);

  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { clip_slots: children(...ids) },
  });

  for (const [sceneIndex, hasClip] of hasClips.entries()) {
    registerMockObject(ids[sceneIndex] as string, {
      path: livePath.track(0).clipSlot(sceneIndex),
      properties: { has_clip: hasClip },
    });
  }

  return registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { scenes: children(...ids) },
  });
}

describe("withScratchSlot", () => {
  it("hands out an empty slot other than the destination", () => {
    const liveSet = registerTrack([0, 1, 0]);
    const path = withScratchSlot(0, 0, (scratch) => scratch.path);

    expect(path).toBe("t0/s2");
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("appends a temp scene when no slot is free, and deletes it even on a throw", () => {
    const liveSet = registerTrack([1, 1]);

    expect(() =>
      withScratchSlot(0, 0, (scratch) => {
        throw new Error(`failed in ${scratch.path}`);
      }),
    ).toThrow("failed in t0/s2");
    expect(liveSet.call).toHaveBeenCalledWith("create_scene", -1);
    expect(liveSet.call).toHaveBeenCalledWith("delete_scene", 2);
  });
});
