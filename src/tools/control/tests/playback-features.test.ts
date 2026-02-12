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
import { playback } from "#src/tools/control/playback.ts";
import {
  setupFollowerTrack,
  setupDefaultTimeSignature,
  setupPlaybackLiveSet,
} from "./playback-test-helpers.ts";

describe("transport", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupDefaultTimeSignature();
  });

  describe("autoFollow behavior for play-arrangement", () => {
    it("should set all tracks to follow arrangement when autoFollow is true (default)", () => {
      liveSet = setupPlaybackLiveSet({
        tracks: children("track1", "track2", "track3"),
      });
      setupFollowerTrack("track1", true);
      setupFollowerTrack("track2", false);
      setupFollowerTrack("track3", true);

      const result = playback({
        action: "play-arrangement",
        startTime: "1|1",
      });

      // Should call back_to_arranger on the song level (affects all tracks)
      expect(liveSet.set).toHaveBeenCalledWith("back_to_arranger", 0);

      expect(result).toStrictEqual({
        playing: true,
        currentTime: "1|1",
        arrangementFollowerTrackIds: "track1,track3", // tracks currently following
      });
    });

    it("should set all tracks to follow arrangement when autoFollow is explicitly true", () => {
      liveSet = setupPlaybackLiveSet({
        tracks: children("track1", "track2"),
      });
      setupFollowerTrack("track1", false);
      setupFollowerTrack("track2", false);

      const result = playback({
        action: "play-arrangement",
        autoFollow: true,
      });

      expect(liveSet.set).toHaveBeenCalledWith("back_to_arranger", 0);

      expect(result).toStrictEqual({
        playing: true,
        currentTime: "1|1",
        arrangementFollowerTrackIds: "", // empty since tracks were not following before the call
      });
    });

    it("should NOT set tracks to follow when autoFollow is false", () => {
      liveSet = setupPlaybackLiveSet({
        tracks: children("track1", "track2"),
      });
      setupFollowerTrack("track1", false);
      setupFollowerTrack("track2", true);

      const result = playback({
        action: "play-arrangement",
        autoFollow: false,
      });

      // Should NOT call back_to_arranger when autoFollow is false
      expect(liveSet.set).not.toHaveBeenCalledWith("back_to_arranger", 0);

      expect(result).toStrictEqual({
        playing: true,
        currentTime: "1|1",
        arrangementFollowerTrackIds: "track2", // only track2 was following
      });
    });

    it("should include arrangementFollowerTrackIds for all transport actions", () => {
      liveSet = setupPlaybackLiveSet({
        loop_length: 0,
        tracks: children("track1", "track2", "track3"),
      });
      setupFollowerTrack("track1", true);
      setupFollowerTrack("track2", false);
      setupFollowerTrack("track3", true);

      const result = playback({
        action: "stop",
      });

      expect(result).toStrictEqual({
        playing: false,
        currentTime: "1|1",
        arrangementFollowerTrackIds: "track1,track3",
      });
    });
  });

  describe("switchView functionality", () => {
    let appView: RegisteredMockObject;

    beforeEach(() => {
      // Register objects needed by select() for view switching
      appView = registerMockObject("live_app view", {
        path: "live_app view",
      });
      registerMockObject("live_set view", { path: "live_set view" });
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
      liveSet = setupPlaybackLiveSet({
        tracks: children("track1", "track2"),
      });
      registerMockObject("live_set scenes 0", {
        path: "live_set scenes 0",
      });
      setupFollowerTrack("track1", true);
      setupFollowerTrack("track2", true);

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
        path: "live_set tracks 0 clip_slots 0 clip",
      });
      registerMockObject("live_set tracks 0 clip_slots 0", {
        path: "live_set tracks 0 clip_slots 0",
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
