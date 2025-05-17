// device/tool-transport.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiSet, mockLiveApiGet } from "./mock-live-api";
import { transport } from "./tool-transport";

describe("transport", () => {
  it("should throw an error when action is missing", () => {
    expect(() => transport({})).toThrow("transport failed: action is required");
  });

  it("should throw an error for unknown action", () => {
    expect(() => transport({ action: "invalid-action" })).toThrow("transport failed: unknown action");
  });

  describe("Arrangement view actions", () => {
    it("should handle play-arrangement action", () => {
      mockLiveApiGet({
        LiveSet: {
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      const result = transport({
        action: "play-arrangement",
        startTime: 16,
      });

      expect(liveApiCall).toHaveBeenNthCalledWith(1, "show_view", "Arranger");
      expect(liveApiCall).toHaveBeenNthCalledWith(2, "start_playing");
      expect(liveApiSet).toHaveBeenCalledWith("start_time", 16);
      expect(result.isPlaying).toBe(true);
      expect(result.currentTime).toBe(16);
    });

    it("should handle stop-arrangement action", () => {
      mockLiveApiGet({
        LiveSet: {
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      const result = transport({ action: "stop-arrangement" });

      expect(liveApiCall).toHaveBeenNthCalledWith(1, "show_view", "Arranger");
      expect(liveApiCall).toHaveBeenNthCalledWith(2, "stop_playing");
      expect(result.isPlaying).toBe(false);
      expect(result.currentTime).toBe(0);
    });

    it("should handle update-arrangement action", () => {
      mockLiveApiGet({
        LiveSet: {
          is_playing: 1,
          current_song_time: 10,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      const result = transport({
        action: "update-arrangement",
        loop: true,
        loopStart: 8,
        loopLength: 16,
      });

      expect(liveApiSet).toHaveBeenCalledWith("loop", true);
      expect(liveApiSet).toHaveBeenCalledWith("loop_start", 8);
      expect(liveApiSet).toHaveBeenCalledWith("loop_length", 16);
      expect(result.isPlaying).toBe(true);
      expect(result.currentTime).toBe(10);
      expect(result.loop).toBe(true);
      expect(result.loopStart).toBe(8);
      expect(result.loopLength).toBe(16);
    });
  });

  describe("Session view actions", () => {
    it("should handle play-session-clip action", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 1 },
        LiveSet: {
          current_song_time: 5,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      const result = transport({
        action: "play-session-clip",
        trackIndex: 0,
        clipSlotIndex: 0,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(liveApiCall).toHaveBeenCalledWith("fire");
      expect(result.isPlaying).toBe(true);
      expect(result.actionPerformed).toBe("play-session-clip");
    });

    it("should throw an error when required parameters are missing for play-session-clip", () => {
      expect(() => transport({ action: "play-session-clip" })).toThrow(
        'transport failed: trackIndex is required for action "play-session-clip"'
      );

      expect(() => transport({ action: "play-session-clip", trackIndex: 0 })).toThrow(
        'transport failed: clipSlotIndex is required for action "play-session-clip"'
      );
    });

    it("should handle play-scene action", () => {
      mockLiveApiGet({
        LiveSet: {
          current_song_time: 5,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      const result = transport({
        action: "play-scene",
        sceneIndex: 1,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(liveApiCall).toHaveBeenCalledWith("fire");
      expect(result.isPlaying).toBe(true);
      expect(result.actionPerformed).toBe("play-scene");
    });

    it("should throw an error when required parameters are missing for play-scene", () => {
      expect(() => transport({ action: "play-scene" })).toThrow(
        'transport failed: sceneIndex is required for action "play-scene"'
      );
    });

    it("should handle stop-track-clips action", () => {
      mockLiveApiGet({
        LiveSet: {
          current_song_time: 5,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      const result = transport({
        action: "stop-track-session-clip",
        trackIndex: 1,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
      expect(result.isPlaying).toBe(false);
      expect(result.actionPerformed).toBe("stop-track-session-clip");
    });

    it("should throw an error when required parameters are missing for stop-track-clips", () => {
      expect(() => transport({ action: "stop-track-session-clip" })).toThrow(
        'transport failed: trackIndex is required for action "stop-track-session-clip"'
      );
    });

    it("should handle stop-all-clips action", () => {
      mockLiveApiGet({
        LiveSet: {
          current_song_time: 5,
          loop: 0,
          loop_start: 0,
          loop_length: 4,
        },
      });

      const result = transport({ action: "stop-all-session-clips" });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
      expect(result.isPlaying).toBe(false);
      expect(result.actionPerformed).toBe("stop-all-session-clips");
    });
  });
});
