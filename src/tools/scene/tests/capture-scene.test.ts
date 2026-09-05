// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { captureScene } from "../capture-scene.ts";

/**
 * Register the live_set, the selected scene, and the scene a capture inserts
 * right after it.
 * @param selectedIndex - Index of the selected scene
 * @param tracks - The live_set's tracks child list
 * @returns The live_set and the newly inserted scene
 */
function setupCaptureMocks(
  selectedIndex = 1,
  tracks: unknown[] = [],
): { liveSet: RegisteredMockObject; newScene: RegisteredMockObject } {
  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks },
  });

  registerMockObject("live_set/view/selected_scene", {
    path: livePath.scene(selectedIndex),
  });

  const newScene = registerMockObject(
    `live_set/scenes/${String(selectedIndex + 1)}`,
    { path: livePath.scene(selectedIndex + 1) },
  );

  return { liveSet, newScene };
}

describe("captureScene", () => {
  it("should capture the currently playing clips", () => {
    const { liveSet } = setupCaptureMocks();

    const result = captureScene();

    expect(liveSet.call).toHaveBeenCalledWith("capture_and_insert_scene");

    expect(result).toStrictEqual({
      id: "live_set/scenes/2",
      path: "s2",
      sceneIndex: 2,
      clips: [],
    });
  });

  it("should select a scene before capturing if sceneIndex is provided", () => {
    const appView = registerMockObject("live_set/view", {
      path: livePath.view.song,
    });

    registerMockObject("live_set/scenes/2", {
      path: livePath.scene(2),
    });

    const { liveSet } = setupCaptureMocks(2);

    const result = captureScene({ sceneIndex: 2 });

    expect(result).toStrictEqual({
      id: "live_set/scenes/3",
      path: "s3",
      sceneIndex: 3,
      clips: [],
    });

    expect(appView.set).toHaveBeenCalledWith(
      "selected_scene",
      "id live_set/scenes/2",
    );

    expect(liveSet.call).toHaveBeenCalledWith("capture_and_insert_scene");
  });

  it("should set the scene name when provided", () => {
    const { liveSet, newScene } = setupCaptureMocks();

    const result = captureScene({ name: "Captured Custom Name" });

    expect(liveSet.call).toHaveBeenCalledWith("capture_and_insert_scene");

    expect(newScene.set).toHaveBeenCalledWith("name", "Captured Custom Name");

    expect(result).toStrictEqual({
      id: "live_set/scenes/2",
      path: "s2",
      sceneIndex: 2,
      clips: [],
    });
  });

  it("should throw an error when selected scene index can't be determined", () => {
    registerMockObject("live_set/view/selected_scene", { path: "" });

    expect(() => captureScene()).toThrow(
      "couldn't determine selected scene index",
    );
  });

  it("does not select a scene when sceneIndex is omitted", () => {
    const appView = registerMockObject("live_set/view", {
      path: livePath.view.song,
    });

    setupCaptureMocks();

    captureScene();

    expect(appView.set).not.toHaveBeenCalled();
  });

  it("does not set a name when none is provided", () => {
    const { newScene } = setupCaptureMocks();

    captureScene();

    // A guard mutated to `if (true)` would call set("name", undefined); a
    // plain not.toHaveBeenCalledWith(..., anything()) can't see undefined.
    expect(newScene.set.mock.calls.filter((c) => c[0] === "name")).toHaveLength(
      0,
    );
  });

  it("parses a two-digit selected scene index", () => {
    setupCaptureMocks(12);

    const result = captureScene();

    expect(result.sceneIndex).toBe(13);
  });

  it("should return captured clips with their IDs and slot paths", () => {
    setupCaptureMocks(0, ["id", "1", "id", "2", "id", "3"]);
    // Mark track 1's clip as non-existent (id "0" makes exists() return false)
    registerMockObject("0", {
      path: livePath.track(1).clipSlot(1).clip(),
    });

    const result = captureScene();

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      path: "s1",
      sceneIndex: 1,
      clips: [
        { id: "live_set/tracks/0/clip_slots/1/clip", path: "t0/s1" },
        { id: "live_set/tracks/2/clip_slots/1/clip", path: "t2/s1" },
      ],
    });
  });
});
