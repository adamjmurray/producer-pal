// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { duplicateSceneToArrangement } from "../sources/duplicate-scene.ts";
import { readScene } from "../sources/scene-clips.ts";

vi.mock(import("../sources/duplicate-scene.ts"), () => ({
  duplicateScene: vi.fn(),
  duplicateSceneToArrangement: vi.fn(async () => ({ clips: [] })),
}));

vi.mock(import("../sources/scene-clips.ts"), () => ({
  forEachClipInScene: vi.fn(),
  readScene: vi.fn(() => ({ sceneIndex: 0, clips: [], length: 16 })),
  readSceneClips: vi.fn(),
  sceneIndexOf: vi.fn(),
}));

/**
 * Copy a 4-bar scene count times end to end from bar 1.
 * @param count - How many copies
 * @param arrangementLength - The call's arrangementLength, if any
 * @returns Where each copy started, in beats
 */
async function copyStarts(
  count: number,
  arrangementLength?: string,
): Promise<number[]> {
  await duplicate({
    type: "scene",
    id: "scene1",
    toPath: "[1|1]",
    count,
    arrangementLength,
  });

  return vi
    .mocked(duplicateSceneToArrangement)
    .mock.calls.map((call) => call[1]);
}

describe("a scene copied to the arrangement - end to end", () => {
  beforeEach(() => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { signature_numerator: 4, signature_denominator: 4 },
    });
    registerMockObject("scene1", { path: livePath.scene(0) });
  });

  it("steps by the scene's length when no arrangementLength is given", async () => {
    expect(await copyStarts(3)).toStrictEqual([0, 16, 32]);
    expect(readScene).toHaveBeenCalledOnce();
  });

  it("steps by one arrangementLength that covers every copy", async () => {
    expect(await copyStarts(2, "8bar")).toStrictEqual([0, 32]);
    // What the copies cover is read from the same pass.
    expect(readScene).toHaveBeenCalledOnce();
  });

  it("steps by each copy's own length from a list", async () => {
    expect(await copyStarts(3, "2bar,1bar,4bar")).toStrictEqual([0, 8, 12]);
  });

  it("keeps the place of a position that throws, and the ones around it", async () => {
    vi.mocked(duplicateSceneToArrangement)
      .mockResolvedValueOnce({ clips: [] })
      .mockRejectedValueOnce(new Error("no room"))
      .mockResolvedValueOnce({ clips: [] });

    const result = await duplicate({
      type: "scene",
      id: "scene1",
      toPath: "[1|1],[5|1],[9|1]",
    });

    expect(result).toStrictEqual([
      { clips: [] },
      { path: "[5|1]", ok: false, detail: "no room" },
      { clips: [] },
    ]);
  });
});
