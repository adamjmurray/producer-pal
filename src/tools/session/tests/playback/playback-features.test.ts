// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import {
  registerClipSlot,
  setupDefaultTimeSignature,
  setupPlaybackLiveSet,
  spyOnWarn,
} from "./playback-test-helpers.ts";

describe("playback path param", () => {
  beforeEach(() => {
    setupPlaybackLiveSet();
  });

  it("fires the clips a path names", () => {
    const clipSlot = registerClipSlot(0, 1);

    playback({ action: "play-session-clips", path: "t0/s1" });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
  });

  it("takes a comma-separated list", () => {
    const first = registerClipSlot(0, 0);
    const second = registerClipSlot(1, 1);

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
    const warn = spyOnWarn();
    const clipSlot = registerClipSlot(0, 1);

    playback({ action: "play-session-clips", path: "0/1" });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith(
      'path "0/1" is the old slot spelling; use "t0/s1"',
    );
  });

  // A caller on the current param may still send the deprecated one as null;
  // counting the coerced "null" as a second target refused the call.
  it("fires what slots names when path is a coerced null", () => {
    const warn = spyOnWarn();
    const clipSlot = registerClipSlot(0, 1);

    playback({ action: "play-session-clips", path: "null", slots: "0/1" });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith('path "null" names nothing');
  });

  it("refuses path and the deprecated slots together", () => {
    expect(() =>
      playback({ action: "play-session-clips", path: "t0/s1", slots: "0/1" }),
    ).toThrow(
      "path names the clips on its own - don't send slots with it (slots is deprecated)",
    );
  });

  // The same check, on a slots that named nothing. A comma is not a second
  // target, so refusing the call reported a conflict the caller never made.
  it("fires what path names when slots names nothing", () => {
    const warn = spyOnWarn();
    const clipSlot = registerClipSlot(0, 1);

    playback({ action: "play-session-clips", path: "t0/s1", slots: "," });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith('slots "," names nothing');
  });

  it("fires a scene a path names", () => {
    const scene = registerMockObject(livePath.scene(3), {
      path: livePath.scene(3),
    });

    playback({ action: "play-scene", path: "s3" });

    expect(scene.call).toHaveBeenCalledWith("fire");
  });

  // A mixed list is no longer a special case: every entry names a scene, so the
  // ordinary disagreement error covers it and says which entry named which.
  it("refuses a scene path alongside a position in another scene", () => {
    expect(() => playback({ action: "play-scene", path: "s3,t0/s1" })).toThrow(
      'action "play-scene" plays one scene, but got ' +
        'scene 3 from path "s3", scene 1 from path "t0/s1"',
    );
  });

  // Even a path and sceneIndex that agree are refused: a path names its scene
  // on its own. Scene 0 is falsy, and the refusal has to read it as a value.
  it.each([
    ["s3", 3],
    ["s3", 1],
    ["s0", 0],
  ])("refuses path %s sent with sceneIndex %d", (path, sceneIndex) => {
    const scene = registerMockObject(livePath.scene(sceneIndex), {
      path: livePath.scene(sceneIndex),
    });

    expect(() => playback({ action: "play-scene", path, sceneIndex })).toThrow(
      "path names the scene on its own - don't send sceneIndex with it",
    );
    expect(scene.call).not.toHaveBeenCalled();
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
      registerClipSlot(0, 0);

      playback({
        action: "play-session-clips",
        id: "clip1",
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
