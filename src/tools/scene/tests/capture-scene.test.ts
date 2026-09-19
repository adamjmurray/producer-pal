// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
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
 * @param sceneCount - How many scenes already exist (default: enough to cover selectedIndex)
 * @returns The live_set and the newly inserted scene
 */
function setupCaptureMocks(
  selectedIndex = 1,
  tracks: unknown[] = [],
  sceneCount = selectedIndex + 1,
): { liveSet: RegisteredMockObject; newScene: RegisteredMockObject } {
  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      tracks,
      scenes: children(
        ...Array.from({ length: sceneCount }, (_, i) => `scene${i}`),
      ),
    },
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

  // The insert lands after the selection, so an index-2 request selects scene 1.
  it("selects the scene before the requested index", () => {
    const appView = registerMockObject("live_set/view", {
      path: livePath.view.song,
    });

    registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });

    const { liveSet } = setupCaptureMocks(1);

    const result = captureScene({ sceneIndex: 2 });

    expect(result).toStrictEqual({
      id: "live_set/scenes/2",
      path: "s2",
      sceneIndex: 2,
      clips: [],
    });

    expect(appView.set).toHaveBeenCalledWith(
      "selected_scene",
      "id live_set/scenes/1",
    );

    expect(liveSet.call).toHaveBeenCalledWith("capture_and_insert_scene");
  });

  it("refuses sceneIndex 0, which has no scene to insert after", () => {
    const { liveSet } = setupCaptureMocks();

    expect(() => captureScene({ sceneIndex: 0 })).toThrow(
      "capture can't insert at s0 - it always inserts after an existing scene. Use s1 or later, or s+ to append",
    );

    expect(liveSet.call).not.toHaveBeenCalled();
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

  it("pads with empty scenes when sceneIndex is past the end", () => {
    const appView = registerMockObject("live_set/view", {
      path: livePath.view.song,
    });

    registerMockObject("live_set/scenes/3", {
      path: livePath.scene(3),
    });

    // Only scenes 0 and 1 exist; s5 (sceneIndex 4) is past the end. Selecting
    // scene 3 (sceneIndex - 1) is what makes the insert land at 4.
    const { liveSet } = setupCaptureMocks(3, [], 2);

    const result = captureScene({ sceneIndex: 4 });

    // Pads indices 2 and 3, then selects scene 3 so the insert lands at 4.
    expect(liveSet.call).toHaveBeenNthCalledWith(1, "create_scene", -1);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "create_scene", -1);
    expect(liveSet.call).toHaveBeenCalledTimes(3);

    expect(appView.set).toHaveBeenCalledWith(
      "selected_scene",
      "id live_set/scenes/3",
    );

    expect(result.sceneIndex).toBe(4);
  });

  it("refuses a sceneIndex that would exceed the maximum allowed scenes", () => {
    const { liveSet } = setupCaptureMocks(0, [], 0);

    expect(() => captureScene({ sceneIndex: MAX_AUTO_CREATED_SCENES })).toThrow(
      /would exceed the maximum allowed scenes/,
    );

    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("allows a sceneIndex up to exactly the maximum", () => {
    registerMockObject("live_set/view", { path: livePath.view.song });

    for (let i = 0; i < MAX_AUTO_CREATED_SCENES; i++) {
      registerMockObject(`live_set/scenes/${String(i)}`, {
        path: livePath.scene(i),
      });
    }

    // Selecting scene MAX-2 (sceneIndex - 1) makes the insert land at MAX-1.
    const { liveSet } = setupCaptureMocks(MAX_AUTO_CREATED_SCENES - 2, [], 0);

    expect(() =>
      captureScene({ sceneIndex: MAX_AUTO_CREATED_SCENES - 1 }),
    ).not.toThrow();

    expect(liveSet.call).toHaveBeenCalledWith("capture_and_insert_scene");
  });
});
