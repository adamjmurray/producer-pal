import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.js";
import { updateClip } from "#src/tools/clip/update/update-clip.js";
import {
  mockContext,
  setupAudioArrangementTest,
  assertSourceClipEndMarker,
  assertDuplicateClipCalled,
  assertRevealedClipMarkers,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.js";

// NOTE: After discovering that the Live API's warp_markers and end_marker properties
// are unreliable for detecting hidden audio content, we changed the behavior to
// always attempt to extend audio clips to the target length, letting Live fill
// with silence if the audio runs out. This simplifies the logic and works reliably.

describe("Unlooped audio clips - arrangementLength extension", () => {
  it("should extend with start_marker offset (scenario: start_marker > 0)", () => {
    const clipId = "705";
    const revealedClipId = "706";

    setupAudioArrangementTest({
      trackIndex: 0,
      clipId,
      revealedClipId,
      sourceEndTime: 7.0,
      targetLength: 14.0,
      startMarker: 1.0,
      name: "Audio No Hidden start>firstStart",
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // targetEndMarker = startMarker + targetLength = 1 + 14 = 15
    assertSourceClipEndMarker(clipId, 15.0);
    assertDuplicateClipCalled(clipId, 7.0);
    // visibleContentEnd = startMarker + sourceEndTime = 1 + 7 = 8
    assertRevealedClipMarkers(revealedClipId, 8.0, 15.0);
    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should calculate correct markers with start_marker offset)", () => {
    const clipId = "716";
    const revealedClipId = "717";

    setupAudioArrangementTest({
      trackIndex: 0,
      clipId,
      revealedClipId,
      sourceEndTime: 4.0,
      targetLength: 14.0,
      startMarker: 1.0,
      name: "Audio Hidden start>firstStart",
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // targetEndMarker = 1 + 14 = 15
    assertSourceClipEndMarker(clipId, 15.0);
    // visibleContentEnd = 1 + 4 = 5
    assertRevealedClipMarkers(revealedClipId, 5.0, 15.0);
    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
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

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 0, // Unwarped - key difference
        start_time: 0.0,
        end_time: 6.0,
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
      live_set: { tempo: 120, scenes: ["id", "scene1"] },
      scene1: { is_empty: 1 },
      [tempSessionClipId]: {
        is_midi_clip: 0,
        is_audio_clip: 1,
        warping: 1,
        looping: 1,
      },
      "live_set/tracks/0/clip_slots/0/clip": {
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
      if (method === "create_audio_clip") return ["id", tempSessionClipId];
      if (method === "duplicate_clip_to_arrangement")
        return ["id", revealedClipId];
      if (method === "delete_clip") return 1;

      return 1;
    });

    const result = updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    expect(liveApiCall).toHaveBeenCalledWith(
      "create_audio_clip",
      "/path/to/audio.wav",
    );

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

    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${sessionClipPath}`,
      6.0,
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "warping",
      0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: revealedClipId }),
      "looping",
      0,
    );

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: `live_set tracks ${trackIndex} clip_slots ${sceneIndex}`,
      }),
      "delete_clip",
    );

    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
  });
});

describe("Unlooped audio clips - move + lengthen combination", () => {
  it("should lengthen relative to new position when move and lengthen are combined", () => {
    const trackIndex = 0;
    const clipId = "900";
    const movedClipId = "901";
    const revealedClipId = "902";

    liveApiPath.mockImplementation(function () {
      if ([clipId, movedClipId, revealedClipId].includes(this._id)) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }

      if (this._path === "live_set") return "live_set";

      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }

      return this._path;
    });

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
      [movedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 1,
        start_time: 8.0,
        end_time: 12.0,
        start_marker: 0.0,
        end_marker: 4.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Audio for move+lengthen",
        trackIndex,
      },
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

        return duplicateCallCount === 1
          ? ["id", movedClipId]
          : ["id", revealedClipId];
      }

      if (method === "delete_clip") return 1;

      return 1;
    });

    const result = updateClip(
      {
        ids: clipId,
        arrangementStart: "3|1", // Move to position 8
        arrangementLength: "2:0", // Extend to 8 beats total
      },
      mockContext,
    );

    // Move happened first
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      8.0,
    );

    expect(liveApiCall).toHaveBeenCalledWith("delete_clip", `id ${clipId}`);

    // Lengthen used NEW position (12.0, not 4.0)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${movedClipId}`,
      12.0,
    );

    expect(result).toStrictEqual([{ id: movedClipId }, { id: revealedClipId }]);
  });
});
