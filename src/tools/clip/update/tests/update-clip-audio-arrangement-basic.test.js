import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { updateClip } from "../update-clip.js";

// NOTE: After discovering that the Live API's warp_markers and end_marker properties
// are unreliable for detecting hidden audio content, we changed the behavior to
// always attempt to extend audio clips to the target length, letting Live fill
// with silence if the audio runs out. This simplifies the logic and hopefully works more reliably.

describe("Unlooped audio clips - arrangementLength extension", () => {
  it("should extend even when audio appears fully visible (clip 661 scenario: start_marker=0)", () => {
    const trackIndex = 0;
    const clipId = "661";
    const revealedClipId = "662";

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId || this._id === revealedClipId) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }

      if (this._path === "live_set") {
        return "live_set";
      }

      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }

      return this._path;
    });

    const mockContext = {
      holdingAreaStartBeats: 1000,
      silenceWavPath: "/path/to/silence.wav",
    };

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0, // Unlooped clip
        warping: 1, // Warped clip
        start_time: 0.0,
        end_time: 8.0, // 8 beats visible in arrangement
        start_marker: 0.0,
        end_marker: 8.0,
        loop_start: 0.0,
        loop_end: 8.0,
        name: "Audio No Hidden start==firstStart",
        trackIndex,
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 8.0,
        end_time: 14.0,
        start_marker: 8.0,
        end_marker: 14.0,
        trackIndex,
      },
    });

    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", revealedClipId];
      }

      return 1;
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should set source clip end_marker to target (3:2 = 14 beats)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      14.0,
    );

    // Should duplicate clip to extend
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      8.0,
    );

    // Should set markers on revealed clip using looping workaround
    // newStartMarker = 8 (visibleContentEnd), newEndMarker = 14 (target)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_end",
      14.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_start",
      8.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      14.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "start_marker",
      8.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      0,
    );

    // Should return original + revealed clip
    expect(result).toEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should extend to target length (clip 672 scenario: start_marker=0, extending beyond visible)", () => {
    const trackIndex = 0;
    const clipId = "672";
    const revealedClipId = "673";

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId || this._id === revealedClipId) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }

      if (this._path === "live_set") {
        return "live_set";
      }

      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }

      return this._path;
    });

    const mockContext = {
      holdingAreaStartBeats: 1000,
      silenceWavPath: "/path/to/silence.wav",
    };

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0, // Unlooped clip
        warping: 1, // Warped clip (has warp_markers)
        start_time: 0.0,
        end_time: 5.0, // 5 beats visible in arrangement
        start_marker: 0.0,
        end_marker: 5.0,
        loop_start: 0.0,
        loop_end: 5.0,
        name: "Audio Hidden start==firstStart",
        trackIndex,
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 5.0,
        end_time: 14.0,
        start_marker: 5.0,
        end_marker: 14.0,
        name: "Audio Hidden start==firstStart",
        trackIndex,
      },
    });

    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", revealedClipId];
      }

      return 1;
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should set source clip end_marker to target length (3:2 = 14 beats)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      14.0,
    );

    // Should duplicate clip to reveal content
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      5.0,
    );

    // Should set markers on revealed clip with workaround
    // newStartMarker = 5 (visibleContentEnd), newEndMarker = 14 (target)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_end",
      14.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_start",
      5.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      14.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "start_marker",
      5.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      0,
    );

    // Should return original + revealed clip (NO empty clip for audio)
    expect(result).toEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should extend even when audio appears fully visible (clip 683 scenario: start_marker=0)", () => {
    const trackIndex = 0;
    const clipId = "683";
    const revealedClipId = "684";

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId || this._id === revealedClipId) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }

      if (this._path === "live_set") {
        return "live_set";
      }

      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }

      return this._path;
    });

    const mockContext = {
      holdingAreaStartBeats: 1000,
      silenceWavPath: "/path/to/silence.wav",
    };

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 1,
        start_time: 0.0,
        end_time: 8.0,
        start_marker: 0.0,
        end_marker: 8.0,
        loop_start: 0.0,
        loop_end: 8.0,
        name: "Audio No Hidden start<firstStart",
        trackIndex,
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 8.0,
        end_time: 14.0,
        start_marker: 8.0,
        end_marker: 14.0,
        trackIndex,
      },
    });

    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", revealedClipId];
      }

      return 1;
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should set source clip end_marker to target (3:2 = 14 beats)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      14.0,
    );

    // Should duplicate clip to extend
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      8.0,
    );

    // Should set markers on revealed clip
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_end",
      14.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_start",
      8.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      14.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "start_marker",
      8.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      0,
    );

    // Should return original + revealed clip
    expect(result).toEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should extend to target length (clip 694 scenario: start_marker=0, extending beyond visible)", () => {
    const trackIndex = 0;
    const clipId = "694";
    const revealedClipId = "695";

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId || this._id === revealedClipId) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }

      if (this._path === "live_set") {
        return "live_set";
      }

      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }

      return this._path;
    });

    const mockContext = {
      holdingAreaStartBeats: 1000,
      silenceWavPath: "/path/to/silence.wav",
    };

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 1,
        start_time: 0.0,
        end_time: 5.0,
        start_marker: 0.0,
        end_marker: 5.0,
        loop_start: 0.0,
        loop_end: 5.0,
        name: "Audio Hidden start<firstStart",
        trackIndex,
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 5.0,
        end_time: 14.0,
        start_marker: 5.0,
        end_marker: 14.0,
        name: "Audio Hidden start<firstStart",
        trackIndex,
      },
    });

    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", revealedClipId];
      }

      return 1;
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should set source clip end_marker to target (3:2 = 14 beats)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      14.0,
    );

    // Should duplicate clip
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      5.0,
    );

    // Should set markers on revealed clip
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_end",
      14.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_start",
      5.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      14.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "start_marker",
      5.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      0,
    );

    // Should return original + revealed clip
    expect(result).toEqual([{ id: clipId }, { id: revealedClipId }]);
  });
});
