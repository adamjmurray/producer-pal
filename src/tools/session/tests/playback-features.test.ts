// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import {
  setupDefaultTimeSignature,
  setupPlaybackLiveSet,
} from "./playback-test-helpers.ts";

describe("playback path param", () => {
  beforeEach(() => {
    setupPlaybackLiveSet({ current_song_time: 5 });
  });

  it("fires the clips a path names", () => {
    const clipSlot = registerMockObject(livePath.track(0).clipSlot(1), {
      path: livePath.track(0).clipSlot(1),
    });

    playback({ action: "play-session-clips", path: "t0/s1" });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
  });

  it("takes a comma-separated list", () => {
    const first = registerMockObject(livePath.track(0).clipSlot(0), {
      path: livePath.track(0).clipSlot(0),
    });
    const second = registerMockObject(livePath.track(1).clipSlot(1), {
      path: livePath.track(1).clipSlot(1),
    });

    playback({ action: "play-session-clips", path: "t0/s0,t1/s1" });

    expect(first.call).toHaveBeenCalledWith("fire");
    expect(second.call).toHaveBeenCalledWith("fire");
  });

  // A bare track names every clip on it, so firing "the" clip would be a guess.
  it("rejects a bare track path", () => {
    expect(() =>
      playback({ action: "play-session-clips", path: "t0" }),
    ).toThrow('invalid path "t0" - a track has no one clip');
  });

  // What results said before 2.2.0, so a model pasting one back made a
  // well-founded guess: honor it, and warn to teach the spelling.
  it("honors the old unprefixed spelling, with a warning", () => {
    const warn = vi.spyOn(console, "warn");
    const clipSlot = registerMockObject(livePath.track(0).clipSlot(1), {
      path: livePath.track(0).clipSlot(1),
    });

    playback({ action: "play-session-clips", path: "0/1" });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith(
      'path "0/1" is the old slot spelling; use "t0/s1"',
    );
  });

  it("refuses path and the deprecated slots together", () => {
    expect(() =>
      playback({ action: "play-session-clips", path: "t0/s1", slots: "0/1" }),
    ).toThrow("playback failed: path and slots both name clips");
  });
});

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

  describe("focus functionality", () => {
    let appView: RegisteredMockObject;

    beforeEach(() => {
      // Register objects needed by select() for view switching
      appView = registerMockObject(livePath.view.app, {
        path: livePath.view.app,
      });
      registerMockObject(livePath.view.song, { path: livePath.view.song });
    });

    it("should switch to arrangement view for play-arrangement action when focus is true", () => {
      liveSet = setupPlaybackLiveSet();

      playback({
        action: "play-arrangement",
        focus: true,
      });

      // Check that select was called with arrangement view
      expect(appView.call).toHaveBeenCalledWith("show_view", "Arranger");
    });

    it("should switch to session view for play-scene action when focus is true", () => {
      liveSet = setupPlaybackLiveSet();
      registerMockObject(livePath.scene(0), {
        path: livePath.scene(0),
      });

      playback({
        action: "play-scene",
        sceneIndex: 0,
        focus: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
    });

    it("should switch to session view for play-session-clips action when focus is true", () => {
      liveSet = setupPlaybackLiveSet();
      registerMockObject("clip1", {
        path: livePath.track(0).clipSlot(0).clip(),
      });
      registerMockObject(livePath.track(0).clipSlot(0), {
        path: livePath.track(0).clipSlot(0),
      });

      playback({
        action: "play-session-clips",
        ids: "clip1",
        focus: true,
      });

      expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
    });

    it("should not switch views when focus is false", () => {
      liveSet = setupPlaybackLiveSet();

      playback({
        action: "play-arrangement",
        focus: false,
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
        focus: true,
      });

      expect(appView.call).not.toHaveBeenCalledWith(
        "show_view",
        expect.anything(),
      );
    });
  });
});
