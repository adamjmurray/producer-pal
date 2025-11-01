import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
  mockLiveApiGet,
} from "../../test/mock-live-api";
import { playback } from "./playback";

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
    expect(() => playback({})).toThrow("playback failed: action is required");
  });

  it("should throw an error for unknown action", () => {
    expect(() => playback({ action: "invalid-action" })).toThrow(
      "playback failed: unknown action",
    );
  });

  it("should handle play-arrangement action", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        loop: 0,
        loop_start: 0,
        loop_length: 4,
        tracks: children("track1", "track2"),
      },
      track1: { back_to_arranger: 0 },
      track2: { back_to_arranger: 1 },
    });

    const result = playback({
      action: "play-arrangement",
      startTime: "5|1",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "start_playing",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "start_time",
      16,
    ); // bar 5 = 16 beats in 4/4
    expect(result).toStrictEqual({
      playing: true,
      currentTime: "5|1",
      arrangementFollowerTrackIds: "track1",
    });
  });

  it("should handle update-arrangement action with loop settings", () => {
    mockLiveApiGet({
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 1,
        current_song_time: 10,
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
      action: "update-arrangement",
      loop: true,
      loopStart: "3|1",
      loopEnd: "7|1",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "loop",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "loop_start",
      8,
    ); // bar 3 = 8 beats
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "loop_length",
      16,
    ); // 24 - 8 = 16 beats (bar 7 - bar 3 = 4 bars)
    // Only loop settings should be called - no back_to_arranger calls for update-arrangement
    expect(liveApiSet).toHaveBeenCalledTimes(3); // 3 for loop/start/length only

    expect(result).toStrictEqual({
      playing: true,
      currentTime: "3|3",
      arrangementLoop: {
        start: "3|1",
        end: "7|1",
      },
      arrangementFollowerTrackIds: "track1,track3",
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

    const result = playback({
      action: "play-arrangement",
      startTime: "3|1",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "start_time",
      6,
    ); // bar 3 = 6 beats in 3/4
    expect(result.currentTime).toBe("3|1");
    // Loop is off, so no arrangementLoop property
    expect(result.arrangementLoop).toBeUndefined();
  });

  it("should handle play-session-clips action with single clip", () => {
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

    // Mock the clip to be a path that resolves to track 0, scene 0
    liveApiPath.mockImplementation(function () {
      if (this._path === "clip1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      return this._path;
    });

    const result = playback({
      action: "play-session-clips",
      clipIds: "clip1",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "fire",
    );
    expect(liveApiCall).toHaveBeenCalledTimes(1); // Only 1 fire call, no stop/start for single clip

    // Verify NO quantization fix for single clip (stop/start should NOT be called)
    expect(liveApiCall).not.toHaveBeenCalledWith("stop_playing");
    expect(liveApiCall).not.toHaveBeenCalledWith("start_playing");

    expect(result).toStrictEqual({
      playing: true,
      currentTime: "2|2",
      arrangementFollowerTrackIds: "track1,track2",
    });
  });

  it("should handle play-session-clips action with multiple clips", () => {
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

    // Mock the clips to be paths that resolve to different tracks/scenes
    liveApiPath.mockImplementation(function () {
      if (this._path === "clip1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      if (this._path === "clip2") {
        return "live_set tracks 1 clip_slots 1 clip";
      }
      if (this._path === "clip3") {
        return "live_set tracks 2 clip_slots 2 clip";
      }
      return this._path;
    });

    playback({
      action: "play-session-clips",
      clipIds: "clip1,clip2,clip3",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: expect.stringContaining("clip_slots") }),
      "fire",
    );
    expect(liveApiCall).toHaveBeenCalledTimes(5); // 3 fire calls + stop_playing + start_playing

    // Verify quantization fix: stop_playing and start_playing should be called for multiple clips
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "stop_playing",
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "start_playing",
    );
  });

  it("should handle whitespace in clipIds", () => {
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

    // Mock the clips to be paths that resolve to different tracks/scenes
    liveApiPath.mockImplementation(function () {
      if (this._path === "clip1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      if (this._path === "clip2") {
        return "live_set tracks 1 clip_slots 1 clip";
      }
      if (this._path === "clip3") {
        return "live_set tracks 2 clip_slots 2 clip";
      }
      return this._path;
    });

    playback({
      action: "play-session-clips",
      clipIds: "clip1, clip2 , clip3",
    });

    // Should fire all 3 clips despite whitespace
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: expect.stringContaining("clip_slots") }),
      "fire",
    );
    expect(liveApiCall).toHaveBeenCalledTimes(5); // 3 fire calls + stop_playing + start_playing

    // Verify quantization fix is applied for multiple clips
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "stop_playing",
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "start_playing",
    );
  });

  it("should throw error when required parameters are missing for play-session-clips", () => {
    expect(() => playback({ action: "play-session-clips" })).toThrow(
      'playback failed: clipIds is required for action "play-session-clips"',
    );
  });

  it("should log warning when clip doesn't exist for play-session-clips", () => {
    liveApiId.mockReturnValue("id 0");
    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = playback({
      action: "play-session-clips",
      clipIds: "nonexistent_clip",
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'playback: id "nonexistent_clip" does not exist',
    );
    expect(result).toBeDefined(); // Operation continues but with no clips played
  });

  it("should throw error when clip slot doesn't exist for play-session-clips", () => {
    // Mock a clip that exists but its slot doesn't
    liveApiPath.mockImplementation(function () {
      if (this._path === "clip1") {
        return "live_set tracks 99 clip_slots 0 clip"; // Track 99 doesn't exist
      }
      return this._path;
    });

    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 99 clip_slots 0") {
        return "id 0"; // This makes the clip slot not exist
      }
      return "id clip1";
    });

    expect(() =>
      playback({
        action: "play-session-clips",
        clipIds: "clip1",
      }),
    ).toThrow(
      "playback play-session-clips action failed: clip slot for clipId=clip1 does not exist",
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
        tracks: children("track1", "track2"),
      },
      Track: {
        back_to_arranger: 0, // 0 means following arrangement
      },
    });
    liveApiType.mockImplementation(function () {
      if (this._path === "live_set") {
        return "LiveSet";
      }
      if (this._path === "scene1") {
        return "Scene";
      }
      if (this._path === "id track1" || this._path === "id track2") {
        return "Track";
      }
      return this._type; // Fall back to default MockLiveAPI logic
    });

    const result = playback({
      action: "play-scene",
      sceneId: "scene1",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "scene1" }),
      "fire",
    );
    expect(result).toStrictEqual({
      playing: true,
      currentTime: "2|2",
      arrangementFollowerTrackIds: "track1,track2",
    });
  });

  it("should throw an error when required parameters are missing for play-scene", () => {
    expect(() => playback({ action: "play-scene" })).toThrow(
      'playback failed: sceneId is required for action "play-scene"',
    );
  });

  it("should throw an error when scene doesn't exist for play-scene", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() =>
      playback({ action: "play-scene", sceneId: "nonexistent_scene" }),
    ).toThrow('playback failed: id "nonexistent_scene" does not exist');
  });

  it("should handle stop-session-clips action with single clip", () => {
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

    // Mock the clip to be a path that resolves to track 0
    liveApiPath.mockImplementation(function () {
      if (this._path === "clip1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      return this._path;
    });

    const result = playback({
      action: "stop-session-clips",
      clipIds: "clip1",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "stop_all_clips",
    );
    expect(result).toStrictEqual({
      playing: true, // transport/arrangement can still be playing
      currentTime: "2|2",
      arrangementFollowerTrackIds: "track1,track2",
    });
  });

  it("should handle stop-session-clips action with multiple clips", () => {
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

    // Mock the clips to be paths that resolve to different tracks
    liveApiPath.mockImplementation(function () {
      if (this._path === "clip1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      if (this._path === "clip2") {
        return "live_set tracks 1 clip_slots 1 clip";
      }
      if (this._path === "clip3") {
        return "live_set tracks 2 clip_slots 2 clip";
      }
      return this._path;
    });

    playback({
      action: "stop-session-clips",
      clipIds: "clip1,clip2,clip3",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: expect.stringContaining("tracks") }),
      "stop_all_clips",
    );
    expect(liveApiCall).toHaveBeenCalledTimes(3); // 3 stop_all_clips calls
  });

  it("should throw an error when required parameters are missing for stop-session-clips", () => {
    expect(() => playback({ action: "stop-session-clips" })).toThrow(
      'playback failed: clipIds is required for action "stop-session-clips"',
    );
  });

  it("should log warning when clip doesn't exist for stop-session-clips", () => {
    liveApiId.mockReturnValue("id 0");
    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = playback({
      action: "stop-session-clips",
      clipIds: "nonexistent_clip",
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'playback: id "nonexistent_clip" does not exist',
    );
    expect(result).toBeDefined(); // Operation continues but with no clips stopped
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

    const result = playback({ action: "stop-all-session-clips" });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "stop_all_clips",
    );
    expect(result).toStrictEqual({
      playing: true, // transport/arrangement can still be playing
      currentTime: "2|2",
      arrangementFollowerTrackIds: "track1,track2",
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

    const result = playback({ action: "stop" });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "stop_playing",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "start_time",
      0,
    );
    expect(result).toStrictEqual({
      playing: false,
      currentTime: "1|1",
      arrangementFollowerTrackIds: "track1,track2",
    });
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

    const result = playback({
      action: "update-arrangement",
      loopEnd: "9|1",
    });

    // loopEnd 9|1 = 32 beats, loopStart is 8 beats, so length should be 24
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "loop_length",
      24,
    );
    // Loop is off in the mock, so no arrangementLoop property
    expect(result.arrangementLoop).toBeUndefined();
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

    const result = playback({
      action: "play-arrangement",
      startTime: "2|1",
      loopStart: "1|1",
      loopEnd: "3|1",
    });

    // In 6/8, bar 2 = 3 Ableton beats (6 musical beats * 4/8)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "start_time",
      3,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "loop_start",
      0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "loop_length",
      6,
    ); // 2 bars = 6 Ableton beats

    expect(result.currentTime).toBe("2|1");
    // Loop is off in the mock (loop: 0), so no arrangementLoop property
    expect(result.arrangementLoop).toBeUndefined();
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

    const result = playback({
      action: "play-arrangement",
      // no startTime provided
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "start_playing",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "start_time",
      0,
    );
    expect(result.currentTime).toBe("1|1");
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
      liveApiType.mockImplementation(function () {
        if (this._path === "live_set") {
          return "LiveSet";
        }
        if (this._path === "live_app view") {
          return "AppView";
        }
        if (this._path === "scene1") {
          return "Scene";
        }
        if (this._path === "id track1" || this._path === "id track2") {
          return "Track";
        }
        return this._type; // Fall back to default MockLiveAPI logic
      });

      playback({
        action: "play-scene",
        sceneId: "scene1",
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
      liveApiPath.mockImplementation(function () {
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
