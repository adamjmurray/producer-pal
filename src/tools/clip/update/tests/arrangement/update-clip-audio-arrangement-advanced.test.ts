// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  mockContext,
  setupAudioArrangementTest,
  assertSourceClipEndMarker,
  assertDuplicateClipCalled,
  assertRevealedClipMarkers,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Audio clip lengthening uses a tiling approach: the existing content range is
// repeated to fill the target length. When the content offset reaches the end
// of the original range, it wraps back to the start.

describe("Unlooped audio clips - arrangementLength extension", () => {
  it("should tile single chunk with start_marker offset (start_marker > 0)", async () => {
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

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // targetEndMarker = startMarker + targetLength = 1 + 14 = 15
    assertSourceClipEndMarker(clipId, 15.0);
    assertDuplicateClipCalled(clipId, 7.0);
    // Content range [1,8] wraps to start (offset=8 resets to 1)
    // Single tile: markers 1→8, remaining=7 fits in one tile
    assertRevealedClipMarkers(revealedClipId, 1.0, 8.0);
    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should tile multiple chunks with start_marker offset", async () => {
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

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // targetEndMarker = 1 + 14 = 15
    assertSourceClipEndMarker(clipId, 15.0);
    // Content range [1,5], tileSize=4, remaining=10 → 3 tiles:
    // Tile 1: full (markers 1→5) at position 4
    assertDuplicateClipCalled(clipId, 4.0);
    assertRevealedClipMarkers(revealedClipId, 1.0, 5.0);
    // Tile 2: full (markers 1→5) at position 8
    assertDuplicateClipCalled(clipId, 8.0);
    // Tile 3: partial (markers 1→3, 2 beats) at position 12
    assertDuplicateClipCalled(clipId, 12.0);
    assertRevealedClipMarkers(revealedClipId, 1.0, 3.0);
    // 1 source clip + 3 tiles (mock returns same ID for all duplicates)
    expect(result).toStrictEqual([
      { id: clipId },
      { id: revealedClipId },
      { id: revealedClipId },
      { id: revealedClipId },
    ]);
  });

  it("should extend unwarped audio clip to target length using session holding area", async () => {
    const trackIndex = 0;
    const clipId = "800";
    const tempSessionClipId = "801";
    const revealedClipId = "802";
    const sceneIndex = 0;

    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
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

    // Unwarped clip: markers at [0, 6] in audio-file beat grid
    // Arrangement shows 6 beats, extending to 12 beats = 6 more beats needed
    // Content wraps to start, tile uses markers [0, 6]
    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 0,
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
        end_time: 12.0,
        start_marker: 6.0,
        end_marker: 12.0,
        trackIndex,
      },
    });

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "create_audio_clip") return ["id", tempSessionClipId];
      if (method === "duplicate_clip_to_arrangement")
        return ["id", revealedClipId];
      if (method === "delete_clip") return 1;

      return 1;
    });

    // Target 12 beats ("3:0") produces a single tile for the unwarped path
    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:0" },
      mockContext,
    );

    expect(liveApiCall).toHaveBeenCalledWith(
      "create_audio_clip",
      "/path/to/audio.wav",
    );

    const sessionClipPath = "live_set/tracks/0/clip_slots/0/clip";

    // Session clip markers set to tile range [0, 6] (audio-file beats)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "loop_end",
      6.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "loop_start",
      0.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "end_marker",
      6.0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: sessionClipPath }),
      "start_marker",
      0.0,
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

    // Should emit envelope loss warning for unwarped audio clip extension
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("Envelopes will be lost in the revealed section"),
    );

    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
  });
});

describe("Unlooped audio clips - move + lengthen combination", () => {
  it("should lengthen relative to new position when move and lengthen are combined", async () => {
    const trackIndex = 0;
    const clipId = "900";
    const movedClipId = "901";
    const revealedClipId = "902";

    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      if (
        this._id &&
        [clipId, movedClipId, revealedClipId].includes(this._id)
      ) {
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

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        duplicateCallCount++;

        return duplicateCallCount === 1
          ? `id ${movedClipId}`
          : `id ${revealedClipId}`;
      }

      if (method === "delete_clip") return 1;

      return 1;
    });

    const result = await updateClip(
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

    // Lengthen: tile at NEW position (12.0, not 4.0)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${movedClipId}`,
      12.0,
    );

    expect(result).toStrictEqual([{ id: movedClipId }, { id: revealedClipId }]);
  });
});
