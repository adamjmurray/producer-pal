// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createScene } from "../create-scene.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

describe("createScene by path", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { scenes: children("existing1", "existing2") },
    });

    for (let i = 0; i <= 3; i++) {
      registerMockObject(`live_set/scenes/${i}`, { path: livePath.scene(i) });
    }
  });

  it("inserts at the index a path names", () => {
    expect(createScene({ path: "s1", name: "Inserted" })).toStrictEqual({
      id: "live_set/scenes/1",
      path: "s1",
    });
    expect(liveSet.call).toHaveBeenCalledWith("create_scene", 1);
  });

  // The Set has two scenes, so "s+" lands at index 2 — the append create-scene
  // had no way to ask for before.
  it("appends with s+", () => {
    expect(createScene({ path: "s+", name: "Appended" })).toStrictEqual({
      id: "live_set/scenes/2",
      path: "s2",
    });
    expect(liveSet.call).toHaveBeenCalledWith("create_scene", 2);
  });

  it("refuses a path that names no place for a scene", () => {
    expect(() => createScene({ path: "t0" })).toThrow(
      'invalid path "t0" - it names no place for a scene; expected "s+" or "s<index>"',
    );
  });

  it("refuses a path sent with sceneIndex", () => {
    expect(() => createScene({ path: "s1", sceneIndex: 0 })).toThrow(
      "path says where the scene goes - don't send sceneIndex with it",
    );
  });

  // capture_and_insert_scene inserts after the selection, so each of these
  // checks the scene the tool selects, not just where the result says it went.
  describe("with capture", () => {
    let appView: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: {
          scenes: children("existing1", "existing2", "existing3"),
          tracks: [],
        },
      });
      appView = registerMockObject("live_set/view", {
        path: livePath.view.song,
      });
    });

    // s1 is the lowest index capture can reach, and the only one that selects
    // the first scene.
    it("captures at s1, selecting the first scene", () => {
      registerMockObject("live_set/view/selected_scene", {
        path: livePath.scene(0),
      });

      expect(createScene({ path: "s1", capture: true })).toStrictEqual({
        id: "live_set/scenes/1",
        path: "s1",
        clips: [],
      });
      expect(appView.set).toHaveBeenCalledWith(
        "selected_scene",
        "id live_set/scenes/0",
      );
    });

    it("captures into the index a path names", () => {
      registerMockObject("live_set/view/selected_scene", {
        path: livePath.scene(1),
      });

      expect(
        createScene({ path: "s2", capture: true, name: "Captured" }),
      ).toStrictEqual({
        id: "live_set/scenes/2",
        path: "s2",
        clips: [],
      });
      expect(appView.set).toHaveBeenCalledWith(
        "selected_scene",
        "id live_set/scenes/1",
      );
    });

    // The Set has three scenes, so "s+" captures at index 3, after scene 2.
    it("captures at the end with s+", () => {
      registerMockObject("live_set/view/selected_scene", {
        path: livePath.scene(2),
      });

      expect(createScene({ path: "s+", capture: true })).toStrictEqual({
        id: "live_set/scenes/3",
        path: "s3",
        clips: [],
      });
      expect(appView.set).toHaveBeenCalledWith(
        "selected_scene",
        "id live_set/scenes/2",
      );
    });

    it("refuses s0, which has no scene to insert after", () => {
      expect(() => createScene({ path: "s0", capture: true })).toThrow(
        "capture can't insert at s0 - it always inserts after an existing scene. Use s1 or later, or s+ to append",
      );
      expect(liveSet.call).not.toHaveBeenCalled();
      expect(appView.set).not.toHaveBeenCalled();
    });
  });
});
