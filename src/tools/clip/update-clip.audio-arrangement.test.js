import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../../test/mock-live-api.js";
import { updateClip } from "./update-clip.js";

describe("Unlooped audio clips - arrangementLength extension", () => {
  it("should NOT reveal when audio fully visible (clip 661 scenario: start_marker=0, no hidden)", () => {
    const trackIndex = 0;
    const clipId = "661";

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
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
        start_time: 0.0,
        end_time: 8.0, // 8 beats visible in arrangement
        start_marker: 0.0,
        end_marker: 8.0,
        loop_start: 0.0,
        loop_end: 8.0,
        name: "Audio No Hidden start==firstStart",
        trackIndex,
        warp_markers: JSON.stringify({
          warp_markers: [
            { sample_time: 0.0, beat_time: 0.0 },
            { sample_time: 4.8, beat_time: 8.0 },
            { sample_time: 4.81875, beat_time: 8.03125 },
          ],
        }),
      },
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should NOT call duplicate_clip_to_arrangement (no hidden content to reveal)
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );

    // Should only return original clip (no empty clips for audio)
    // When only 1 clip, updateClip returns a single object not an array
    expect(result).toEqual({ id: clipId });
  });

  it("should reveal hidden audio content (clip 672 scenario: start_marker=0, hidden content)", () => {
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
        warp_markers: JSON.stringify({
          warp_markers: [
            { sample_time: 0.0, beat_time: 0.0 },
            { sample_time: 4.8, beat_time: 8.0 },
            { sample_time: 4.81875, beat_time: 8.03125 },
          ],
        }),
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 5.0,
        end_time: 8.0,
        start_marker: 5.0,
        end_marker: 8.0,
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

    // Should set source clip end_marker to actual audio end
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      8.0,
    );

    // Should duplicate clip to reveal hidden content
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      5.0,
    );

    // Should set markers on revealed clip with workaround
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_end",
      8.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_start",
      5.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      8.0,
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

  it("should NOT reveal when audio fully visible (clip 683 scenario: start_marker=0, no hidden)", () => {
    const trackIndex = 0;
    const clipId = "683";

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
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
        start_time: 0.0,
        end_time: 8.0,
        start_marker: 0.0,
        end_marker: 8.0,
        loop_start: 0.0,
        loop_end: 8.0,
        name: "Audio No Hidden start<firstStart",
        trackIndex,
        warp_markers: JSON.stringify({
          warp_markers: [
            { sample_time: 0.0, beat_time: 0.0 },
            { sample_time: 4.8, beat_time: 8.0 },
            { sample_time: 4.81875, beat_time: 8.03125 },
          ],
        }),
      },
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    expect(liveApiCall).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );

    // When only 1 clip, updateClip returns a single object not an array
    expect(result).toEqual({ id: clipId });
  });

  it("should reveal hidden audio content (clip 694 scenario: start_marker=0, hidden content)", () => {
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
        warp_markers: JSON.stringify({
          warp_markers: [
            { sample_time: 0.0, beat_time: 0.0 },
            { sample_time: 4.8, beat_time: 8.0 },
            { sample_time: 4.81875, beat_time: 8.03125 },
          ],
        }),
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 5.0,
        end_time: 8.0,
        start_marker: 5.0,
        end_marker: 8.0,
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

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      8.0,
    );

    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      5.0,
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_end",
      8.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_start",
      5.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      8.0,
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

    expect(result).toEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should NOT reveal when start_marker offset means no hidden content (clip 705 scenario)", () => {
    const trackIndex = 0;
    const clipId = "705";

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
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
        start_time: 0.0,
        end_time: 7.0, // 7 beats visible
        start_marker: 1.0, // Offset by 1 beat
        end_marker: 8.0,
        loop_start: 1.0,
        loop_end: 8.0,
        name: "Audio No Hidden start>firstStart",
        trackIndex,
        warp_markers: JSON.stringify({
          warp_markers: [
            { sample_time: 0.0, beat_time: 0.0 },
            { sample_time: 4.8, beat_time: 8.0 },
            { sample_time: 4.81875, beat_time: 8.03125 },
          ],
        }),
      },
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should NOT call duplicate_clip_to_arrangement (no hidden content to reveal)
    expect(liveApiCall).not.toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      expect.anything(),
      expect.anything(),
    );

    // Should only return original clip
    // When only 1 clip, updateClip returns a single object not an array
    expect(result).toEqual({ id: clipId });
  });

  it("should calculate correct markers with start_marker offset (clip 716 scenario)", () => {
    const trackIndex = 0;
    const clipId = "716";
    const revealedClipId = "717";

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
        end_time: 4.0, // 4 beats visible
        start_marker: 1.0, // Offset by 1 beat
        end_marker: 5.0,
        loop_start: 1.0,
        loop_end: 5.0,
        name: "Audio Hidden start>firstStart",
        trackIndex,
        warp_markers: JSON.stringify({
          warp_markers: [
            { sample_time: 0.0, beat_time: 0.0 },
            { sample_time: 4.8, beat_time: 8.0 },
            { sample_time: 4.81875, beat_time: 8.03125 },
          ],
        }),
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 4.0,
        end_time: 8.0,
        start_marker: 5.0,
        end_marker: 8.0,
        name: "Audio Hidden start>firstStart",
        trackIndex,
      },
    });

    liveApiCall.mockImplementation(function (method, _args) {
      if (method === "duplicate_clip_to_arrangement") {
        return ["id", revealedClipId];
      }
      return 1;
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should set source clip end_marker to actual audio end (8.0 from warp markers)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      8.0,
    );

    // Critical: verify markers account for start_marker offset
    // visibleContentEnd = 1.0 (start_marker) + 4.0 (currentArrangementLength) = 5.0
    // newStartMarker should be 5.0, newEndMarker should be 8.0
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_end",
      8.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_start",
      5.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      8.0,
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

  it("should reveal hidden content in unwarped audio clip using session holding area", () => {
    const trackIndex = 0;
    const clipId = "800";
    const tempSessionClipId = "801";
    const revealedClipId = "802";
    const sceneIndex = 0;

    liveApiPath.mockImplementation(function () {
      if (this._id === clipId || this._id === revealedClipId) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }
      if (this._id === tempSessionClipId) {
        return `live_set tracks ${trackIndex} clip_slots ${sceneIndex} clip`;
      }
      if (this._path === "live_set") {
        return "live_set";
      }
      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }
      if (
        this._path === `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`
      ) {
        return `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`;
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
        looping: 0, // Unlooped
        warping: 0, // Unwarped - key difference from warped tests
        start_time: 0.0,
        end_time: 6.0, // 6 beats visible in arrangement
        start_marker: 0.0,
        end_marker: 6.0,
        loop_start: 0.0,
        loop_end: 6.0,
        name: "Unwarped Audio Hidden",
        trackIndex,
        file_path: "/path/to/audio.wav",
        sample_length: 211680,
        sample_rate: 44100,
      },
      live_set: {
        tempo: 120,
        scenes: ["id", "scene1"],
      },
      scene1: {
        is_empty: 1,
      },
      [tempSessionClipId]: {
        is_midi_clip: 0,
        is_audio_clip: 1,
        warping: 1, // Temp clip starts warped
        looping: 1, // Temp clip starts looped
      },
      "live_set/tracks/0/clip_slots/0/clip": {
        // Path-based session clip (same as tempSessionClipId but accessed via path)
        is_midi_clip: 0,
        is_audio_clip: 1,
        warping: 1,
        looping: 1,
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 0,
        start_time: 6.0,
        end_time: 9.6,
        start_marker: 6.0,
        end_marker: 9.6,
        trackIndex,
      },
    });

    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "create_audio_clip") {
        // Session clip creation
        return ["id", tempSessionClipId];
      }
      if (method === "duplicate_clip_to_arrangement") {
        // Duplicating temp clip to arrangement
        return ["id", revealedClipId];
      }
      if (method === "delete_clip") {
        // Deleting temp session clip
        return 1;
      }
      return 1;
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should create temp clip in session with audio file
    expect(liveApiCall).toHaveBeenCalledWith(
      "create_audio_clip",
      "/path/to/audio.wav",
    );

    // Should warp temp clip (already done by createAudioClipInSession)
    // Should loop temp clip (already done by createAudioClipInSession)

    // Should set markers in BEATS while warped and looped
    // Note: Session clip is now created with path-based construction
    const sessionClipPath = "live_set/tracks/0/clip_slots/0/clip";
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "loop_end",
      9.6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "loop_start",
      6.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "end_marker",
      9.6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "start_marker",
      6.0,
    );

    // Should duplicate temp clip to arrangement (while still warped)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${sessionClipPath}`, // Path-based ID
      6.0,
    );

    // Should unwarp the REVEALED clip (Live will auto-convert beats to seconds)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "warping",
      0,
    );

    // Should unloop the REVEALED clip after unwarping
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      0,
    );

    // Should delete temp session clip
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
      }),
      "delete_clip",
    );

    // Should return original + revealed clip
    expect(result).toEqual([{ id: clipId }, { id: revealedClipId }]);
  });
});
