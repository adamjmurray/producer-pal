// src/tools/transport.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiSet, mockLiveApiGet } from "../mock-live-api";
import { transport } from "./transport";

describe("transport", () => {
  beforeEach(() => {
    // Default time signature for tests
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });
  });

  it("should throw an error when action is missing", () => {
    expect(() => transport({})).toThrow("transport failed: action is required");
  });

  it("should throw an error for unknown action", () => {
    expect(() => transport({ action: "invalid-action" })).toThrow("transport failed: unknown action");
  });

  it("should handle play-arrangement action", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = transport({
      action: "play-arrangement",
      startTime: "5:1",
    });

    expect(liveApiCall).toHaveBeenNthCalledWith(1, "show_view", "Arranger");
    expect(liveApiCall).toHaveBeenNthCalledWith(2, "start_playing");
    expect(liveApiSet).toHaveBeenCalledWith("start_time", 16); // bar 5 = 16 beats in 4/4
    expect(result).toStrictEqual({
      action: "play-arrangement",
      currentTime: "5:1",
      isPlaying: true,
      loop: false,
      loopEnd: "2:1",
      loopStart: "1:1",
      startTime: "5:1",
    });
  });

  it("should handle update-arrangement action with followingTrackIndexes", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
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
      loopStart: "3:1",
      loopEnd: "7:1",
      followingTrackIndexes: "0,2,3",
    });

    expect(liveApiSet).toHaveBeenCalledWith("loop", true);
    expect(liveApiSet).toHaveBeenCalledWith("loop_start", 8); // bar 3 = 8 beats
    expect(liveApiSet).toHaveBeenCalledWith("loop_length", 16); // 24 - 8 = 16 beats (bar 7 - bar 3 = 4 bars)
    expect(liveApiSet).toHaveBeenCalledWith("back_to_arranger", 0);
    expect(liveApiSet).toHaveBeenCalledTimes(6); // 3 for loop/start/length, 3 for back_to_arranger

    expect(result).toStrictEqual({
      action: "update-arrangement",
      currentTime: "3:3",
      isPlaying: true,
      loop: true,
      loopStart: "3:1",
      loopEnd: "7:1",
      followingTrackIndexes: "0,2,3",
    });
  });

  it("should handle different time signatures", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 3,
        signature_denominator: 4,
        loop: 0,
        loop_start: 0,
        loop_length: 3,
      },
    });

    const result = transport({
      action: "play-arrangement",
      startTime: "3:1",
    });

    expect(liveApiSet).toHaveBeenCalledWith("start_time", 6); // bar 3 = 6 beats in 3/4
    expect(result.currentTime).toBe("3:1");
    expect(result.loopEnd).toBe("2:1"); // 3 beats = 1 bar in 3/4
  });

  it("should handle play-session-clip action with single track and clip", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 1 },
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        current_song_time: 5,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = transport({
      action: "play-session-clip",
      trackIndexes: "0",
      clipSlotIndexes: "0",
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    expect(liveApiCall).toHaveBeenCalledWith("fire");
    expect(result).toStrictEqual({
      action: "play-session-clip",
      currentTime: "2:2",
      isPlaying: true,
      loop: false,
      loopStart: "1:1",
      loopEnd: "2:1",
      trackIndexes: "0",
      clipSlotIndexes: "0",
    });
  });

  it("should handle play-session-clip action with multiple tracks and clips", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 1 },
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        current_song_time: 5,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = transport({
      action: "play-session-clip",
      trackIndexes: "0,1,2",
      clipSlotIndexes: "0,1,2",
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    expect(liveApiCall).toHaveBeenCalledWith("fire");
    expect(liveApiCall).toHaveBeenCalledTimes(4); // 1 show_view + 3 fire calls
    expect(result.trackIndexes).toBe("0,1,2");
    expect(result.clipSlotIndexes).toBe("0,1,2");
  });

  it("should reuse last clipSlotIndex when fewer clipSlotIndexes than trackIndexes", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 1 },
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        current_song_time: 5,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    transport({
      action: "play-session-clip",
      trackIndexes: "0,1,2",
      clipSlotIndexes: "0,1",
    });

    // Should fire clips at (0,0), (1,1), and (2,1) - reusing clipSlotIndex 1 for track 2
    expect(liveApiCall).toHaveBeenCalledWith("fire");
    expect(liveApiCall).toHaveBeenCalledTimes(4); // 1 show_view + 3 fire calls
  });

  it("should throw error when required parameters are missing for play-session-clip", () => {
    expect(() => transport({ action: "play-session-clip" })).toThrow(
      'transport failed: trackIndexes is required for action "play-session-clip"'
    );

    expect(() => transport({ action: "play-session-clip", trackIndexes: "0" })).toThrow(
      'transport failed: clipSlotIndexes is required for action "play-session-clip"'
    );
  });

  it("should throw error when clip slot doesn't exist for play-session-clip", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => transport({ action: "play-session-clip", trackIndexes: "99", clipSlotIndexes: "0" })).toThrow(
      "transport play-session-clip action failed: clip slot at trackIndex=99, clipSlotIndex=0 does not exist"
    );
  });

  it("should throw error when clip slot is empty for play-session-clip", () => {
    mockLiveApiGet({ ClipSlot: { has_clip: 0 } });
    expect(() => transport({ action: "play-session-clip", trackIndexes: "0", clipSlotIndexes: "0" })).toThrow(
      "transport play-session-clip action failed: no clip at trackIndex=0, clipSlotIndex=0"
    );
  });

  it("should handle play-scene action", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
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
      currentTime: "2:2",
      isPlaying: true,
      loop: false,
      loopStart: "1:1",
      loopEnd: "2:1",
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

  it("should handle stop-track-session-clip action with single track", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 1,
        current_song_time: 5,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = transport({
      action: "stop-track-session-clip",
      trackIndexes: "1",
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
    expect(result).toStrictEqual({
      action: "stop-track-session-clip",
      currentTime: "2:2",
      isPlaying: true, // transport/arrangement can still be playing
      loop: false,
      loopStart: "1:1",
      loopEnd: "2:1",
      trackIndexes: "1",
    });
  });

  it("should handle stop-track-session-clip action with multiple tracks", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 1,
        current_song_time: 5,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    transport({
      action: "stop-track-session-clip",
      trackIndexes: "0,1,2",
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
    expect(liveApiCall).toHaveBeenCalledTimes(4); // 1 show_view + 3 stop_all_clips calls
  });

  it("should throw an error when required parameters are missing for stop-track-session-clip", () => {
    expect(() => transport({ action: "stop-track-session-clip" })).toThrow(
      'transport failed: trackIndexes is required for action "stop-track-session-clip"'
    );
  });

  it("should throw an error when track doesn't exist for stop-track-session-clip", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => transport({ action: "stop-track-session-clip", trackIndexes: "99" })).toThrow(
      "transport stop-track-session-clip action failed: track at trackIndex=99 does not exist"
    );
  });

  it("should handle stop-all-clips action", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
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
      currentTime: "2:2",
      isPlaying: true, // transport/arrangement can still be playing
      loop: false,
      loopStart: "1:1",
      loopEnd: "2:1",
    });
  });

  it("should handle stop action", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
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
      currentTime: "1:1",
      isPlaying: false,
      loop: false,
      loopEnd: "2:1",
      loopStart: "1:1",
    });
  });

  it("should throw error for invalid track indexes in trackIndexes", () => {
    expect(() =>
      transport({
        action: "play-session-clip",
        trackIndexes: "0,invalid,2",
        clipSlotIndexes: "0",
      })
    ).toThrow('Invalid index "invalid" - must be a valid integer');
  });

  it("should throw error for invalid clip slot indexes in clipSlotIndexes", () => {
    expect(() =>
      transport({
        action: "play-session-clip",
        trackIndexes: "0",
        clipSlotIndexes: "0,invalid,2",
      })
    ).toThrow('Invalid index "invalid" - must be a valid integer');
  });

  it("should throw error for invalid track indexes in followingTrackIndexes", () => {
    expect(() =>
      transport({
        action: "update-arrangement",
        followingTrackIndexes: "0,invalid,2",
      })
    ).toThrow('Invalid index "invalid" - must be a valid integer');
  });

  it("should handle loop end calculation correctly", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        loop: 0,
        loop_start: 8,
        loop_length: 16,
      },
    });

    const result = transport({
      action: "update-arrangement",
      loopEnd: "9:1",
    });

    // loopEnd 9:1 = 32 beats, loopStart is 8 beats, so length should be 24
    expect(liveApiSet).toHaveBeenCalledWith("loop_length", 24);
    expect(result.loopStart).toBe("3:1"); // 8 beats = bar 3
    expect(result.loopEnd).toBe("9:1");
  });

  it("should handle 6/8 time signature conversions", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 6,
        signature_denominator: 8,
        loop: 0,
        loop_start: 0,
        loop_length: 3,
      },
    });

    const result = transport({
      action: "play-arrangement",
      startTime: "2:1",
      loopStart: "1:1",
      loopEnd: "3:1",
    });

    // In 6/8, bar 2 = 3 Ableton beats (6 musical beats * 4/8)
    expect(liveApiSet).toHaveBeenCalledWith("start_time", 3);
    expect(liveApiSet).toHaveBeenCalledWith("loop_start", 0);
    expect(liveApiSet).toHaveBeenCalledWith("loop_length", 6); // 2 bars = 6 Ableton beats

    expect(result.startTime).toBe("2:1");
    expect(result.currentTime).toBe("2:1");
    expect(result.loopStart).toBe("1:1");
    expect(result.loopEnd).toBe("3:1");
  });

  it("should handle play-arrangement action without startTime (defaults to 0)", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
      },
    });

    const result = transport({
      action: "play-arrangement",
      // no startTime provided
    });

    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
    expect(liveApiCall).toHaveBeenCalledWith("start_playing");
    expect(liveApiSet).toHaveBeenCalledWith("start_time", 0);
    expect(result.currentTime).toBe("1:1");
    expect(result.startTime).toBeUndefined();
  });

  it("should throw error for invalid track indexes in stop-track-session-clip", () => {
    expect(() =>
      transport({
        action: "stop-track-session-clip",
        trackIndexes: "0,invalid,2",
      })
    ).toThrow('Invalid index "invalid" - must be a valid integer');
  });
});
