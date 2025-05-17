// device/tool-transport.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiSet, mockLiveApiGet } from "./mock-live-api";
import { transport } from "./tool-transport";

describe("transport", () => {
  it("should throw an error when action is missing", () => {
    expect(() => transport({})).toThrow("transport failed: action is required");
  });

  it("should throw an error for unknown action", () => {
    expect(() => transport({ action: "invalid-action" })).toThrow("transport failed: unknown action");
  });

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
    expect(result).toStrictEqual({
      action: "play-arrangement",
      currentTime: 16,
      isPlaying: true,
      loop: false,
      loopLength: 4,
      loopStart: 0,
      startTime: 16,
    });
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
    expect(result).toStrictEqual({
      action: "update-arrangement",
      currentTime: 10,
      isPlaying: true,
      loop: true,
      loopStart: 8,
      loopLength: 16,
    });
  });

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
    expect(result).toStrictEqual({
      action: "play-session-clip",
      currentTime: 5,
      isPlaying: true,
      loop: false,
      loopStart: 0,
      loopLength: 4,
      trackIndex: 0,
      clipSlotIndex: 0,
    });
  });

  it("should throw an error when required parameters are missing for play-session-clip", () => {
    expect(() => transport({ action: "play-session-clip" })).toThrow(
      'transport failed: trackIndex is required for action "play-session-clip"'
    );

    expect(() => transport({ action: "play-session-clip", trackIndex: 0 })).toThrow(
      'transport failed: clipSlotIndex is required for action "play-session-clip"'
    );
  });

  it("should throw an error when clip slot doesn't exist for play-session-clip", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => transport({ action: "play-session-clip", trackIndex: 99, clipSlotIndex: 0 })).toThrow(
      "transport play-session-clip action failed: clip slot at trackIndex=99, clipSlotIndex=0 does not exist"
    );
  });

  it("should throw an error when clip slot is empty for play-session-clip", () => {
    mockLiveApiGet({ ClipSlot: { has_clip: 0 } });
    expect(() => transport({ action: "play-session-clip", trackIndex: 0, clipSlotIndex: 0 })).toThrow(
      "transport play-session-clip action failed: no clip at trackIndex=0, clipSlotIndex=0"
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
    expect(result).toStrictEqual({
      action: "play-scene",
      currentTime: 5,
      isPlaying: true,
      loop: false,
      loopStart: 0,
      loopLength: 4,
      sceneIndex: 1,
    });
  });

  it("should throw an error when required parameters are missing for play-scene", () => {
    expect(() => transport({ action: "play-scene" })).toThrow(
      'transport failed: sceneIndex is required for action "play-scene"'
    );
  });

  it("should throw an error when scene doesn't exist for play-scene", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => transport({ action: "play-scene", sceneIndex: 99 })).toThrow(
      "transport play-session-scene action failed: scene at sceneIndex=99 does not exist"
    );
  });

  it("should handle stop-track-session-clip action", () => {
    mockLiveApiGet({
      LiveSet: {
        is_playing: 1,
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
    expect(result).toStrictEqual({
      action: "stop-track-session-clip",
      currentTime: 5,
      isPlaying: true, // transport/arrangement can still be playing
      loop: false,
      loopStart: 0,
      loopLength: 4,
      trackIndex: 1,
    });
  });

  it("should throw an error when required parameters are missing for stop-track-session-clip", () => {
    expect(() => transport({ action: "stop-track-session-clip" })).toThrow(
      'transport failed: trackIndex is required for action "stop-track-session-clip"'
    );
  });

  it("should throw an error when track doesn't exist for stop-track-session-clip", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => transport({ action: "stop-track-session-clip", trackIndex: 99 })).toThrow(
      "transport stop-track-session-clip action failed: track at trackIndex=99 does not exist"
    );
  });

  it("should handle stop-all-clips action", () => {
    mockLiveApiGet({
      LiveSet: {
        is_playing: 1,
        current_song_time: 5,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = transport({ action: "stop-all-session-clips" });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
    expect(result).toStrictEqual({
      action: "stop-all-session-clips",
      currentTime: 5,
      isPlaying: true, // transport/arrangement can still be playing
      loop: false,
      loopStart: 0,
      loopLength: 4,
    });
  });

  it("should handle stop action", () => {
    mockLiveApiGet({
      LiveSet: {
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = transport({ action: "stop" });

    expect(liveApiCall).toHaveBeenCalledWith("stop_playing");
    expect(liveApiSet).toHaveBeenCalledWith("start_time", 0);
    expect(result).toStrictEqual({
      action: "stop",
      currentTime: 0,
      isPlaying: false,
      loop: false,
      loopLength: 4,
      loopStart: 0,
    });
  });
});
