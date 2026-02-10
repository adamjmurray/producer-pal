// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  type MockLiveAPIContext,
  MockSequence,
} from "#src/test/mocks/mock-live-api.ts";
import * as tilingHelpers from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  assertSourceClipEndMarker,
  mockContext,
  setupArrangementClipPath,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Warped audio clip lengthening uses session-based tiling: a single tile is
// created via createAudioClipInSession with the exact remaining arrangement
// length, because arrangement clip end_time is immutable after creation.

/**
 * Set up mocks for session-based warped audio tiling.
 * @param fileContentBoundary - File's actual content length (returned by getProperty("end_marker"))
 * @returns Mock objects for assertions
 */
function setupSessionTilingMock(fileContentBoundary = 20.0) {
  const sessionClip = {
    id: "session-temp",
    set: vi.fn(),
    getProperty: vi.fn().mockImplementation((prop: string) => {
      if (prop === "end_marker") return fileContentBoundary;

      return null;
    }),
  };
  const sessionSlot = {
    call: vi.fn(),
  };
  const mockCreate = vi
    .spyOn(tilingHelpers, "createAudioClipInSession")
    .mockReturnValue({
      clip: sessionClip as unknown as LiveAPI,
      slot: sessionSlot as unknown as LiveAPI,
    });

  return { mockCreate, sessionClip, sessionSlot };
}

describe("Unlooped warped audio clips - arrangementLength extension", () => {
  it("should create single tile via session (start_marker > 0)", async () => {
    const clipId = "705";
    const tileClipId = "706";

    setupArrangementClipPath(0, [clipId, tileClipId]);

    // Source: warped, unlooped, arrangement 0-7, content [1, 8]
    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 1,
        start_time: 0.0,
        end_time: 7.0,
        start_marker: 1.0,
        end_marker: 8.0,
        loop_start: 1.0,
        loop_end: 8.0,
        name: "Audio No Hidden start>firstStart",
        trackIndex: 0,
        file_path: "/audio/test.wav",
      },
    });

    const { mockCreate, sessionClip, sessionSlot } = setupSessionTilingMock();

    liveApiCall.mockImplementation(function (method: string) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${tileClipId}`;
      }

      return 1;
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Source end_marker extended: startMarker(1) + target(14) = 15
    assertSourceClipEndMarker(clipId, 15.0);

    // Session clip created for boundary detection (loop_end=1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "/audio/test.wav",
    );

    // Session markers set to content range [8, 15]
    expect(sessionClip.set).toHaveBeenCalledWith("loop_end", 15.0);
    expect(sessionClip.set).toHaveBeenCalledWith("loop_start", 8.0);
    expect(sessionClip.set).toHaveBeenCalledWith("end_marker", 15.0);
    expect(sessionClip.set).toHaveBeenCalledWith("start_marker", 8.0);

    // Tile duplicated from session to arrangement at position 7
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id session-temp",
      7.0,
    );

    // Tile clip unlooped
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: tileClipId }),
      "looping",
      0,
    );

    // Session slot cleaned up
    expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

    expect(result).toStrictEqual([{ id: clipId }, { id: tileClipId }]);
    mockCreate.mockRestore();
  });

  it("should create single tile for hidden content (was multiple before fix)", async () => {
    const clipId = "716";
    const tileClipId = "717";

    setupArrangementClipPath(0, [clipId, tileClipId]);

    // Source: warped, unlooped, arrangement 0-4, content [1, 5] (hidden content)
    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 1,
        start_time: 0.0,
        end_time: 4.0,
        start_marker: 1.0,
        end_marker: 5.0,
        loop_start: 1.0,
        loop_end: 5.0,
        name: "Audio Hidden start>firstStart",
        trackIndex: 0,
        file_path: "/audio/test.wav",
      },
    });

    const { mockCreate, sessionClip, sessionSlot } = setupSessionTilingMock();

    liveApiCall.mockImplementation(function (method: string) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${tileClipId}`;
      }

      return 1;
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Source end_marker extended: startMarker(1) + target(14) = 15
    assertSourceClipEndMarker(clipId, 15.0);

    // Session clip created for boundary detection (loop_end=1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "/audio/test.wav",
    );

    // Session markers set to content range [5, 15]
    expect(sessionClip.set).toHaveBeenCalledWith("loop_end", 15.0);
    expect(sessionClip.set).toHaveBeenCalledWith("loop_start", 5.0);
    expect(sessionClip.set).toHaveBeenCalledWith("end_marker", 15.0);
    expect(sessionClip.set).toHaveBeenCalledWith("start_marker", 5.0);

    // Single tile duplicated at position 4 (not 3 tiles like before)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id session-temp",
      4.0,
    );

    // Session slot cleaned up
    expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

    // Now 2 clips instead of 4 (source + 1 session-based tile)
    expect(result).toStrictEqual([{ id: clipId }, { id: tileClipId }]);
    mockCreate.mockRestore();
  });
});

describe("Unlooped unwarped audio clips - arrangementLength extension via loop_end", () => {
  it("should extend unwarped clip by setting loop_end (hidden content)", async () => {
    const clipId = "800";

    setupArrangementClipPath(0, [clipId]);

    // Unwarped clip: loop 0-3s, arrangement 0-6 beats, extending to 12 beats
    // After setting loop_end, end_time changes from 6.0 to 12.0
    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 0,
        start_time: 0.0,
        end_time: new MockSequence(6.0, 12.0),
        start_marker: 0.0,
        end_marker: 6.0,
        loop_start: 0.0,
        loop_end: 3.0,
        name: "Unwarped Audio",
        trackIndex: 0,
      },
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:0" },
      mockContext,
    );

    // loop_end set to target: 0 + 12 / (6/3) = 6.0 seconds
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: clipId }),
      "loop_end",
      6.0,
    );

    // Single clip returned (no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
  });

  it("should emit warning when capped at file boundary", async () => {
    const clipId = "810";

    setupArrangementClipPath(0, [clipId]);

    // Unwarped clip: loop 0-3s, arrangement 0-6 beats
    // After setting loop_end, end_time only goes to 9.6 (file boundary)
    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 0,
        start_time: 0.0,
        end_time: new MockSequence(6.0, 9.6),
        start_marker: 0.0,
        end_marker: 6.0,
        loop_start: 0.0,
        loop_end: 3.0,
        name: "Unwarped Capped",
        trackIndex: 0,
      },
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:0" },
      mockContext,
    );

    // Single clip, capped at boundary
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
  });

  it("should emit warning when no additional content available", async () => {
    const clipId = "820";

    setupArrangementClipPath(0, [clipId]);

    // Unwarped clip: loop 0-3s, arrangement 0-6 beats
    // After setting loop_end, end_time stays at 6.0 (at file boundary)
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
        loop_end: 3.0,
        name: "Unwarped No Hidden",
        trackIndex: 0,
      },
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:0" },
      mockContext,
    );

    // Single clip, unchanged
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
  });
});

describe("Unlooped audio clips - move + lengthen combination", () => {
  it("should lengthen relative to new position when move and lengthen are combined", async () => {
    const trackIndex = 0;
    const clipId = "900";
    const movedClipId = "901";
    const tileClipId = "902";

    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._id && [clipId, movedClipId, tileClipId].includes(this._id)) {
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
        file_path: "/audio/test.wav",
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
        file_path: "/audio/test.wav",
      },
    });

    const { mockCreate, sessionSlot } = setupSessionTilingMock();

    let duplicateCallCount = 0;

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        duplicateCallCount++;

        // First: move, second: tile from session
        return duplicateCallCount === 1
          ? `id ${movedClipId}`
          : `id ${tileClipId}`;
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

    // Session clip created for boundary detection (loop_end=1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "/audio/test.wav",
    );

    // Tile duplicated from session at NEW position (12.0)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id session-temp",
      12.0,
    );

    // Session slot cleaned up
    expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

    expect(result).toStrictEqual([{ id: movedClipId }, { id: tileClipId }]);
    mockCreate.mockRestore();
  });
});
