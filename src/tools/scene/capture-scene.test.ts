// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { captureScene } from "./capture-scene.ts";

describe("captureScene", () => {
  it("should capture the currently playing clips", () => {
    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: [] },
    });

    registerMockObject("live_set/view/selected_scene", {
      path: livePath.scene(1),
    });
    registerMockObject("live_set/scenes/2", {
      path: livePath.scene(2),
    });

    const result = captureScene();

    expect(liveSet.call).toHaveBeenCalledWith("capture_and_insert_scene");

    expect(result).toStrictEqual({
      id: "live_set/scenes/2",
      sceneIndex: 2,
      clips: [],
    });
  });

  it("should select a scene before capturing if sceneIndex is provided", () => {
    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: [] },
    });
    const appView = registerMockObject("live_set/view", {
      path: livePath.view.song,
    });

    registerMockObject("live_set/scenes/2", {
      path: livePath.scene(2),
    });
    registerMockObject("live_set/view/selected_scene", {
      path: livePath.scene(2),
    });
    registerMockObject("live_set/scenes/3", {
      path: livePath.scene(3),
    });

    const result = captureScene({ sceneIndex: 2 });

    expect(result).toStrictEqual({
      id: "live_set/scenes/3",
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
    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: [] },
    });

    registerMockObject("live_set/view/selected_scene", {
      path: livePath.scene(1),
    });
    const newScene = registerMockObject("live_set/scenes/2", {
      path: livePath.scene(2),
    });

    const result = captureScene({ name: "Captured Custom Name" });

    expect(liveSet.call).toHaveBeenCalledWith("capture_and_insert_scene");

    expect(newScene.set).toHaveBeenCalledWith("name", "Captured Custom Name");

    expect(result).toStrictEqual({
      id: "live_set/scenes/2",
      sceneIndex: 2,
      clips: [],
    });
  });

  it("should throw an error when selected scene index can't be determined", () => {
    registerMockObject("live_set/view/selected_scene", { path: "" });

    expect(() => captureScene()).toThrow(
      "capture-scene failed: couldn't determine selected scene index",
    );
  });

  it("should return captured clips with their IDs and track indices", () => {
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: ["id", "1", "id", "2", "id", "3"] },
    });
    registerMockObject("live_set/view/selected_scene", {
      path: livePath.scene(0),
    });
    registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });
    // Mark track 1's clip as non-existent (id "0" makes exists() return false)
    registerMockObject("0", {
      path: livePath.track(1).clipSlot(1).clip(),
    });

    const result = captureScene();

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
      clips: [
        { id: "live_set/tracks/0/clip_slots/1/clip", trackIndex: 0 },
        { id: "live_set/tracks/2/clip_slots/1/clip", trackIndex: 2 },
      ],
    });
  });
});
