// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { createScene } from "./create-scene.ts";

describe("createScene", () => {
  let liveSet: RegisteredMockObject;
  let appView: RegisteredMockObject;
  let scene0: RegisteredMockObject;
  let scene1: RegisteredMockObject;
  let scene2: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set", {
      path: "live_set",
      properties: { scenes: children("existing1", "existing2") },
    });
    appView = registerMockObject("app-view", {
      path: "live_app view",
    });
    scene0 = registerMockObject("live_set/scenes/0", {
      path: "live_set scenes 0",
    });
    scene1 = registerMockObject("live_set/scenes/1", {
      path: "live_set scenes 1",
    });
    scene2 = registerMockObject("live_set/scenes/2", {
      path: "live_set scenes 2",
    });

    // Register additional scenes for tests that need higher indices (e.g., padding)
    for (let i = 3; i <= 5; i++) {
      registerMockObject(`live_set/scenes/${i}`, {
        path: `live_set scenes ${i}`,
      });
    }
  });

  it("should create a single scene at the specified index", () => {
    const result = createScene({
      sceneIndex: 1,
      name: "New Scene",
      color: "#FF0000",
      tempo: 120,
      timeSignature: "3/4",
    });

    expect(liveSet.call).toHaveBeenCalledWith("create_scene", 1);
    expect(scene1.set).toHaveBeenCalledWith("name", "New Scene");
    expect(scene1.set).toHaveBeenCalledWith("color", 16711680);
    expect(scene1.set).toHaveBeenCalledWith("tempo", 120);
    expect(scene1.set).toHaveBeenCalledWith("tempo_enabled", true);
    expect(scene1.set).toHaveBeenCalledWith("time_signature_numerator", 3);
    expect(scene1.set).toHaveBeenCalledWith("time_signature_denominator", 4);
    expect(scene1.set).toHaveBeenCalledWith("time_signature_enabled", true);
    expect(result).toStrictEqual({ id: "live_set/scenes/1", sceneIndex: 1 });
  });

  it("should create multiple scenes with auto-incrementing names", () => {
    const result = createScene({
      sceneIndex: 0,
      count: 3,
      name: "Verse",
      color: "#00FF00",
    });

    expect(liveSet.call).toHaveBeenNthCalledWith(1, "create_scene", 0);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "create_scene", 1);
    expect(liveSet.call).toHaveBeenNthCalledWith(3, "create_scene", 2);

    expect(scene0.set).toHaveBeenCalledWith("name", "Verse");
    expect(scene1.set).toHaveBeenCalledWith("name", "Verse 2");
    expect(scene2.set).toHaveBeenCalledWith("name", "Verse 3");

    expect(result).toStrictEqual([
      { id: "live_set/scenes/0", sceneIndex: 0 },
      { id: "live_set/scenes/1", sceneIndex: 1 },
      { id: "live_set/scenes/2", sceneIndex: 2 },
    ]);
  });

  it("should create scenes without setting properties when not provided", () => {
    const result = createScene({ sceneIndex: 0 });

    expect(liveSet.call).toHaveBeenCalledWith("create_scene", 0);
    expect(scene0.set).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ id: "live_set/scenes/0", sceneIndex: 0 });
  });

  it("should pad with empty scenes when sceneIndex exceeds current count", () => {
    createScene({
      sceneIndex: 5, // Want to insert at index 5, but only have 2 scenes (indices 0,1)
      name: "Future Scene",
    });

    // Should create 3 padding scenes (indices 2,3,4) then the actual scene at index 5
    expect(liveSet.call).toHaveBeenCalledWith("create_scene", -1);
    expect(liveSet.call).toHaveBeenCalledWith("create_scene", 5);
    expect(liveSet.call).toHaveBeenCalledTimes(4);
  });

  it("should disable tempo when -1 is passed", () => {
    createScene({
      sceneIndex: 0,
      tempo: -1,
    });

    expect(scene0.set).toHaveBeenCalledWith("tempo_enabled", false);
    expect(scene0.set).not.toHaveBeenCalledWith("tempo", expect.any(Number));
  });

  it("should disable time signature when 'disabled' is passed", () => {
    createScene({
      sceneIndex: 0,
      timeSignature: "disabled",
    });

    expect(scene0.set).toHaveBeenCalledWith("time_signature_enabled", false);
    expect(scene0.set).not.toHaveBeenCalledWith(
      "time_signature_numerator",
      expect.any(Number),
    );
    expect(scene0.set).not.toHaveBeenCalledWith(
      "time_signature_denominator",
      expect.any(Number),
    );
  });

  it("should throw error when sceneIndex is missing", () => {
    expect(() => createScene({})).toThrow(
      "createScene failed: sceneIndex is required",
    );
    expect(() => createScene({ count: 2 })).toThrow(
      "createScene failed: sceneIndex is required",
    );
  });

  it("should throw error when count is less than 1", () => {
    expect(() => createScene({ sceneIndex: 0, count: 0 })).toThrow(
      "createScene failed: count must be at least 1",
    );
    expect(() => createScene({ sceneIndex: 0, count: -1 })).toThrow(
      "createScene failed: count must be at least 1",
    );
  });

  it("should throw error for invalid time signature format", () => {
    expect(() =>
      createScene({ sceneIndex: 0, timeSignature: "invalid" }),
    ).toThrow("Time signature must be in format");
    expect(() => createScene({ sceneIndex: 0, timeSignature: "3-4" })).toThrow(
      "Time signature must be in format",
    );
  });

  it("should throw error when creating scenes would exceed maximum", () => {
    expect(() =>
      createScene({
        sceneIndex: MAX_AUTO_CREATED_SCENES - 2,
        count: 5,
      }),
    ).toThrow(/would exceed the maximum allowed scenes/);
  });

  it("should return single object for count=1 and array for count>1", () => {
    const singleResult = createScene({
      sceneIndex: 0,
      count: 1,
      name: "Single",
    });
    const arrayResult = createScene({
      sceneIndex: 1,
      count: 2,
      name: "Multiple",
    });

    expect(singleResult).toStrictEqual({
      id: "live_set/scenes/0",
      sceneIndex: 0,
    });

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    const arrayResultArr = arrayResult as Array<{
      id: string;
      sceneIndex: number;
    }>;

    expect(arrayResultArr[0]).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
    });
    expect(arrayResultArr[1]).toStrictEqual({
      id: "live_set/scenes/2",
      sceneIndex: 2,
    });
  });

  it("should handle single scene name without incrementing", () => {
    const result = createScene({
      sceneIndex: 0,
      count: 1,
      name: "Solo Scene",
    });

    expect(scene0.set).toHaveBeenCalledWith("name", "Solo Scene");
    expect(result).toStrictEqual({ id: "live_set/scenes/0", sceneIndex: 0 });
  });

  it("should include disabled tempo and timeSignature in result", () => {
    const result = createScene({
      sceneIndex: 0,
      tempo: -1,
      timeSignature: "disabled",
    });

    expect(result).toStrictEqual({ id: "live_set/scenes/0", sceneIndex: 0 });
  });

  describe("capture mode", () => {
    let captureLiveSet: RegisteredMockObject;
    let capturedScene: RegisteredMockObject;
    let captureAppView: RegisteredMockObject;

    beforeEach(() => {
      captureLiveSet = registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: [] },
      });
      captureAppView = registerMockObject("live_set/view", {
        path: "live_set view",
      });
      registerMockObject("live_set/scenes/1", {
        path: "live_set scenes 1",
      });
      registerMockObject("live_set/view/selected_scene", {
        path: "live_set scenes 1",
      });
      capturedScene = registerMockObject("live_set/scenes/2", {
        path: "live_set scenes 2",
      });
    });

    it("should delegate to captureScene when capture=true", () => {
      const result = createScene({ capture: true });

      expect(captureLiveSet.call).toHaveBeenCalledWith(
        "capture_and_insert_scene",
      );

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should delegate to captureScene with sceneIndex and name", () => {
      const result = createScene({
        capture: true,
        sceneIndex: 1,
        name: "Custom Capture",
      });

      expect(captureAppView.set).toHaveBeenCalledWith(
        "selected_scene",
        "id live_set/scenes/1",
      );

      expect(capturedScene.set).toHaveBeenCalledWith("name", "Custom Capture");

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should apply additional properties after capture", () => {
      const result = createScene({
        capture: true,
        name: "Captured with Props",
        color: "#FF0000",
        tempo: 140,
        timeSignature: "3/4",
      });

      expect(capturedScene.set).toHaveBeenCalledWith("color", 16711680);
      expect(capturedScene.set).toHaveBeenCalledWith("tempo", 140);
      expect(capturedScene.set).toHaveBeenCalledWith("tempo_enabled", true);

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should handle disabled tempo and timeSignature in capture mode", () => {
      const result = createScene({
        capture: true,
        tempo: -1,
        timeSignature: "disabled",
      });

      expect(capturedScene.set).toHaveBeenCalledWith("tempo_enabled", false);
      expect(capturedScene.set).toHaveBeenCalledWith(
        "time_signature_enabled",
        false,
      );

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should return clips when capturing with existing clips", () => {
      registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: ["id", "1", "id", "2", "id", "3"] },
      });
      // Mark track 1's clip as non-existent (id "0" makes exists() return false)
      registerMockObject("0", {
        path: "live_set tracks 1 clip_slots 2 clip",
      });

      const result = createScene({
        capture: true,
        name: "With Clips",
      });

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [
          { id: "live_set/tracks/0/clip_slots/2/clip", trackIndex: 0 },
          { id: "live_set/tracks/2/clip_slots/2/clip", trackIndex: 2 },
        ],
      });
    });
  });

  describe("switchView functionality", () => {
    it("should switch to session view when creating scenes with switchView=true", () => {
      const result = createScene({
        sceneIndex: 0,
        switchView: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
      expect(result).toStrictEqual({
        id: "live_set/scenes/0",
        sceneIndex: 0,
      });
    });

    it("should switch to session view when capturing scenes with switchView=true", () => {
      registerMockObject("live_set", {
        path: "live_set",
        properties: { tracks: [] },
      });
      registerMockObject("live_set/view/selected_scene", {
        path: "live_set scenes 1",
      });

      const result = createScene({
        capture: true,
        switchView: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should not switch views when switchView=false", () => {
      createScene({
        sceneIndex: 0,
        switchView: false,
      });

      expect(appView.call).not.toHaveBeenCalledWith(
        "show_view",
        expect.anything(),
      );
    });

    it("should work with multiple scenes when switchView=true", () => {
      const result = createScene({
        sceneIndex: 0,
        count: 3,
        switchView: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
    });
  });
});
