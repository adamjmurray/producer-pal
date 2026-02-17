// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/control/playback.ts";
import {
  setupDefaultTimeSignature,
  setupPlaybackLiveSet,
} from "./playback-test-helpers.ts";

describe("transport", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupDefaultTimeSignature();
  });

  it("should always set tracks to follow arrangement on play-arrangement", () => {
    liveSet = setupPlaybackLiveSet();

    playback({
      action: "play-arrangement",
      startTime: "1|1",
    });

    expect(liveSet.set).toHaveBeenCalledWith("back_to_arranger", 0);
  });

  describe("switchView functionality", () => {
    let appView: RegisteredMockObject;

    beforeEach(() => {
      // Register objects needed by select() for view switching
      appView = registerMockObject(livePath.view.app, {
        path: livePath.view.app,
      });
      registerMockObject(livePath.view.song, { path: livePath.view.song });
    });

    it("should switch to arrangement view for play-arrangement action when switchView is true", () => {
      liveSet = setupPlaybackLiveSet();

      playback({
        action: "play-arrangement",
        switchView: true,
      });

      // Check that select was called with arrangement view
      expect(appView.call).toHaveBeenCalledWith("show_view", "Arranger");
    });

    it("should switch to session view for play-scene action when switchView is true", () => {
      liveSet = setupPlaybackLiveSet();
      registerMockObject(livePath.scene(0), {
        path: livePath.scene(0),
      });

      playback({
        action: "play-scene",
        sceneIndex: 0,
        switchView: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
    });

    it("should switch to session view for play-session-clips action when switchView is true", () => {
      liveSet = setupPlaybackLiveSet();
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });
      registerMockObject(livePath.track(0).clipSlot(0), {
        path: livePath.track(0).clipSlot(0),
      });

      playback({
        action: "play-session-clips",
        clipIds: "clip1",
        switchView: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
    });

    it("should not switch views when switchView is false", () => {
      liveSet = setupPlaybackLiveSet();

      playback({
        action: "play-arrangement",
        switchView: false,
      });

      // Check that show_view was NOT called for view switching
      expect(appView.call).not.toHaveBeenCalledWith(
        "show_view",
        expect.anything(),
      );
    });

    it("should not switch views for actions that don't have a target view", () => {
      liveSet = setupPlaybackLiveSet();

      playback({
        action: "stop",
        switchView: true,
      });

      expect(appView.call).not.toHaveBeenCalledWith(
        "show_view",
        expect.anything(),
      );
    });
  });
});
