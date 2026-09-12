// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readScene } from "../read-scene.ts";

/**
 * Register a Live Set with no tracks and one scene, the least a scene read
 * needs to count the clips in it.
 * @param sceneIndex - Where the scene sits
 * @param sceneId - Mock-registry id for the scene
 */
function setupScene(sceneIndex: number, sceneId: string): void {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    type: "Song",
    properties: { tracks: [] },
  });
  registerMockObject(sceneId, {
    path: livePath.scene(sceneIndex),
    type: "Scene",
    properties: { name: "By Path" },
  });
}

describe("readScene by path", () => {
  it("reads the scene a path names", () => {
    setupScene(1, "456");

    expect(readScene({ path: "s1" })).toStrictEqual({
      id: "456",
      path: "s1",
      name: "By Path",
      clipCount: 0,
    });
  });

  // A read has nothing left to return, so a bad path throws rather than
  // warning the way the write tools' lists do.
  it("throws when the path names nothing", () => {
    mockNonExistentObjects();

    expect(() => readScene({ path: "s9" })).toThrow('nothing at path "s9"');
  });

  it("throws when the path names something else", () => {
    expect(() => readScene({ path: "t0" })).toThrow(
      'invalid path "t0" - names a track, not a scene',
    );
  });

  it.each([
    ["id", { id: "456" }],
    ["sceneIndex", { sceneIndex: 0 }],
  ])("refuses a path sent with %s", (_name, other) => {
    expect(() => readScene({ path: "s1", ...other })).toThrow(
      "path names the scene on its own",
    );
  });
});
