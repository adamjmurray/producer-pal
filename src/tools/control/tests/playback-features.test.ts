import { beforeEach, describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiPath,
  liveApiSet,
  liveApiType,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { playback } from "#src/tools/control/playback.ts";
import { setupDefaultTimeSignature } from "./playback-test-helpers.ts";

describe("transport", () => {
  beforeEach(() => {
    setupDefaultTimeSignature();
  });

  describe("autoFollow behavior for play-arrangement", () => {
    it("should set all tracks to follow arrangement when autoFollow is true (default)", () => {
      mockLiveApiGet({
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
          tracks: children("track1", "track2", "track3"),
        },
        track1: { back_to_arranger: 0 },
        track2: { back_to_arranger: 1 },
        track3: { back_to_arranger: 0 },
      });

      const result = playback({
        action: "play-arrangement",
        startTime: "1|1",
      });

      // Should call back_to_arranger on the song level (affects all tracks)
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "back_to_arranger",
        0,
      );

      expect(result).toStrictEqual({
        playing: true,
        currentTime: "1|1",
        arrangementFollowerTrackIds: "track1,track3", // tracks currently following
      });
    });

    it("should set all tracks to follow arrangement when autoFollow is explicitly true", () => {
      mockLiveApiGet({
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
          tracks: children("track1", "track2"),
        },
        track1: { back_to_arranger: 1 }, // not following
        track2: { back_to_arranger: 1 }, // not following
      });

      const result = playback({
        action: "play-arrangement",
        autoFollow: true,
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "back_to_arranger",
        0,
      );

      expect(result).toStrictEqual({
        playing: true,
        currentTime: "1|1",
        arrangementFollowerTrackIds: "", // empty since tracks were not following before the call
      });
    });

    it("should NOT set tracks to follow when autoFollow is false", () => {
      mockLiveApiGet({
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
          tracks: children("track1", "track2"),
        },
        track1: { back_to_arranger: 1 }, // not following
        track2: { back_to_arranger: 0 }, // following
      });

      const result = playback({
        action: "play-arrangement",
        autoFollow: false,
      });

      // Should NOT call back_to_arranger when autoFollow is false
      expect(liveApiSet).not.toHaveBeenCalledWith("back_to_arranger", 0);

      expect(result).toStrictEqual({
        playing: true,
        currentTime: "1|1",
        arrangementFollowerTrackIds: "track2", // only track2 was following
      });
    });

    it("should include arrangementFollowerTrackIds for all transport actions", () => {
      mockLiveApiGet({
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
          loop: 0,
          loop_start: 0,
          loop_length: 0,
          tracks: children("track1", "track2", "track3"),
        },
        track1: { back_to_arranger: 0 },
        track2: { back_to_arranger: 1 },
        track3: { back_to_arranger: 0 },
      });

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
    it("should switch to arrangement view for play-arrangement action when switchView is true", () => {
      mockLiveApiGet({
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      playback({
        action: "play-arrangement",
        switchView: true,
      });

      // Check that select was called with arrangement view
      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
    });

    it("should switch to session view for play-scene action when switchView is true", () => {
      mockLiveApiGet({
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
          tracks: children("track1", "track2"),
        },
        Track: {
          back_to_arranger: 0,
        },
        AppView: {
          focused_document_view: "Session",
        },
      });
      liveApiType.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "live_set") {
          return "LiveSet";
        }

        if (this._path === "live_app view") {
          return "AppView";
        }

        if (this._path === "live_set scenes 0") {
          return "Scene";
        }

        if (this._path === "id track1" || this._path === "id track2") {
          return "Track";
        }

        // Fall back to default MockLiveAPI logic (returns undefined)
      });

      playback({
        action: "play-scene",
        sceneIndex: 0,
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    });

    it("should switch to session view for play-session-clips action when switchView is true", () => {
      mockLiveApiGet({
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      // Mock clip path resolution
      liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }

        return this._path;
      });

      playback({
        action: "play-session-clips",
        clipIds: "clip1",
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    });

    it("should not switch views when switchView is false", () => {
      mockLiveApiGet({
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      playback({
        action: "play-arrangement",
        switchView: false,
      });

      // Check that show_view was NOT called for view switching
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "show_view",
        expect.anything(),
      );
    });

    it("should not switch views for actions that don't have a target view", () => {
      mockLiveApiGet({
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      playback({
        action: "stop",
        switchView: true,
      });

      expect(liveApiCall).not.toHaveBeenCalledWith(
        "show_view",
        expect.anything(),
      );
    });
  });
});
