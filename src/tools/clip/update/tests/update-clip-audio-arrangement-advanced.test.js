import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../../../../test/mock-live-api.js";
import { updateClip } from "../update-clip.js";

// NOTE: After discovering that the Live API's warp_markers and end_marker properties
// are unreliable for detecting hidden audio content, we changed the behavior to
// always attempt to extend audio clips to the target length, letting Live fill
// with silence if the audio runs out. This simplifies the logic and works reliably.

describe("Unlooped audio clips - arrangementLength extension", () => {
  it("should extend with start_marker offset (scenario: start_marker > 0)", () => {
    const trackIndex = 0;
    const clipId = "705";
    const revealedClipId = "706";

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
        end_time: 7.0, // 7 beats visible
        start_marker: 1.0, // Offset by 1 beat
        end_marker: 8.0,
        loop_start: 1.0,
        loop_end: 8.0,
        name: "Audio No Hidden start>firstStart",
        trackIndex,
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 7.0,
        end_time: 14.0,
        start_marker: 8.0,
        end_marker: 15.0,
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

    // Should set source clip end_marker to target
    // clipStartMarkerBeats = 1, arrangementLengthBeats = 14, so targetEndMarker = 15
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      15.0,
    );

    // Should duplicate clip to extend
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      7.0,
    );

    // Should set markers on revealed clip
    // visibleContentEnd = 1 + 7 = 8, newEndMarker = 8 + (14-7) = 15
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_end",
      15.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_start",
      8.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      15.0,
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

  it("should calculate correct markers with start_marker offset)", () => {
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
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 4.0,
        end_time: 14.0,
        start_marker: 5.0,
        end_marker: 15.0,
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

    // Should set source clip end_marker to target (1 + 14 = 15)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      15.0,
    );

    // Critical: verify markers account for start_marker offset
    // visibleContentEnd = 1.0 (start_marker) + 4.0 (currentArrangementLength) = 5.0
    // newStartMarker should be 5.0, newEndMarker should be 15.0 (5 + 10)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_end",
      15.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "loop_start",
      5.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "end_marker",
      15.0,
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

  it("should extend unwarped audio clip to target length using session holding area", () => {
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
        end_time: 14.0,
        start_marker: 6.0,
        end_marker: 14.0,
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
    // For unwarped clips, clipStartMarkerBeats = 0 * (120/60) = 0
    // visibleContentEnd = 0 + 6 = 6, targetEndMarker = 0 + 14 = 14
    // newStartMarker = 6, newEndMarker = 14
    const sessionClipPath = "live_set/tracks/0/clip_slots/0/clip";
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "loop_end",
      14.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "loop_start",
      6.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "end_marker",
      14.0,
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

describe("Unlooped audio clips - move + lengthen combination", () => {
  it("should lengthen relative to new position when move and lengthen are combined", () => {
    // This test verifies the order of operations:
    // 1. Move happens FIRST (clip goes to new position)
    // 2. Lengthen happens SECOND (tile placed relative to NEW position, not old)
    const trackIndex = 0;
    const clipId = "900";
    const movedClipId = "901";
    const revealedClipId = "902";

    liveApiPath.mockImplementation(function () {
      if (
        this._id === clipId ||
        this._id === movedClipId ||
        this._id === revealedClipId
      ) {
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

    // Original clip at position 0-4 (4 beats), warped, unlooped
    // Has hidden content (can extend to 8 beats)
    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 1,
        start_time: 0.0,
        end_time: 4.0,
        start_marker: 0.0,
        end_marker: 4.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Audio for move+lengthen",
        trackIndex,
      },
      // Moved clip - now at position 8-12
      [movedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 1,
        start_time: 8.0, // Moved to position 8
        end_time: 12.0, // Still 4 beats long
        start_marker: 0.0,
        end_marker: 4.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Audio for move+lengthen",
        trackIndex,
      },
      // Revealed clip - should be at position 12-16 (after moved clip)
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 12.0,
        end_time: 16.0,
        start_marker: 4.0,
        end_marker: 8.0,
        trackIndex,
      },
    });

    let duplicateCallCount = 0;
    liveApiCall.mockImplementation(function (method, ..._args) {
      if (method === "duplicate_clip_to_arrangement") {
        duplicateCallCount++;
        if (duplicateCallCount === 1) {
          // First duplicate is the move operation
          return ["id", movedClipId];
        }
        // Second duplicate is the lengthen operation (revealing hidden content)
        return ["id", revealedClipId];
      }
      if (method === "delete_clip") {
        return 1;
      }
      return 1;
    });

    const result = updateClip(
      {
        ids: clipId,
        arrangementStart: "3|1", // Move to position 8 (3|1 in 4/4 = 8 beats)
        arrangementLength: "2:0", // Extend to 8 beats total
      },
      mockContext,
    );

    // Verify move happened first: duplicate to position 8
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      8.0, // New position (3|1 = 8 beats)
    );

    // Verify original clip was deleted after move
    expect(liveApiCall).toHaveBeenCalledWith("delete_clip", `id ${clipId}`);

    // CRITICAL: Verify lengthen used NEW position
    // The revealed clip should be placed at position 12 (after moved clip at 8-12)
    // NOT at position 4 (which would be the old end position)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${movedClipId}`,
      12.0, // This is moved_clip.end_time, NOT original clip end (4.0)
    );

    // Should return moved clip + revealed clip
    expect(result).toEqual([{ id: movedClipId }, { id: revealedClipId }]);
  });
});
