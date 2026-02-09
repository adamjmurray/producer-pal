// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiSet,
  mockLiveApiGet,
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
// If the file has no content beyond what's shown, lengthening is skipped.
// If the file has some content but not enough for the target, it's capped.

/**
 * Set up mocks for session-based warped audio tiling.
 * @param fileContentBoundary - File's actual content length (returned by getProperty("end_marker"))
 * @returns Mock objects for assertions
 */
function setupSessionTilingMock(fileContentBoundary = 8.0) {
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

describe("Unlooped warped audio clips - skip when no additional content", () => {
  // These clips show all file content (end_marker = file boundary = 8)
  // No hidden content → nothing to reveal → skip
  const noHiddenCases = [
    ["661", 8.0, "Audio No Hidden start==firstStart"],
    ["683", 8.0, "Audio No Hidden start<firstStart"],
  ];

  it.each(noHiddenCases)(
    "should skip lengthening when file too short (clip %s: %s)",
    async (clipId, sourceEndTime, name) => {
      const cId = clipId as string;
      const endTime = sourceEndTime as number;

      setupArrangementClipPath(0, [cId]);

      mockLiveApiGet({
        [cId]: {
          is_arrangement_clip: 1,
          is_midi_clip: 0,
          is_audio_clip: 1,
          looping: 0,
          warping: 1,
          start_time: 0.0,
          end_time: endTime,
          start_marker: 0.0,
          end_marker: endTime,
          loop_start: 0.0,
          loop_end: endTime,
          name: name as string,
          trackIndex: 0,
          file_path: "/audio/test.wav",
        },
      });

      // File boundary = 8, target = 14 → insufficient
      const { mockCreate, sessionSlot } = setupSessionTilingMock(8.0);

      const result = await updateClip(
        { ids: cId, arrangementLength: "3:2" },
        mockContext,
      );

      // Session clip created for boundary detection (loop_end=1)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        1,
        "/audio/test.wav",
      );

      // Session clip cleaned up after detecting insufficient content
      expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

      // Source clip NOT modified (no end_marker extension)
      expect(liveApiSet).not.toHaveBeenCalledWithThis(
        expect.objectContaining({ id: cId }),
        "end_marker",
        expect.anything(),
      );

      // unwrapSingleResult returns single object for single-element arrays
      expect(result).toStrictEqual({ id: cId });
      mockCreate.mockRestore();
    },
  );
});

describe("Unlooped warped audio clips - cap when file partially sufficient", () => {
  // Hidden content clips: end_marker=5 < file boundary=8, target=14
  // File has 3 beats of hidden content → cap to 8, create tile for [5,8]
  const hiddenContentCases = [
    ["672", 5.0, "Audio Hidden start==firstStart", "673"],
    ["694", 5.0, "Audio Hidden start<firstStart", "695"],
  ];

  it.each(hiddenContentCases)(
    "should cap and create tile for hidden content (clip %s: %s)",
    async (clipId, sourceEndTime, name, tileId) => {
      const cId = clipId as string;
      const endTime = sourceEndTime as number;
      const tileClipId = tileId as string;

      setupArrangementClipPath(0, [cId, tileClipId]);

      mockLiveApiGet({
        [cId]: {
          is_arrangement_clip: 1,
          is_midi_clip: 0,
          is_audio_clip: 1,
          looping: 0,
          warping: 1,
          start_time: 0.0,
          end_time: endTime,
          start_marker: 0.0,
          end_marker: endTime,
          loop_start: 0.0,
          loop_end: endTime,
          name: name as string,
          trackIndex: 0,
          file_path: "/audio/test.wav",
        },
      });

      // File boundary = 8, target = 14 → cap to 8 (partial extension)
      const { mockCreate, sessionClip, sessionSlot } =
        setupSessionTilingMock(8.0);

      liveApiCall.mockImplementation(function (method: string) {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${tileClipId}`;
        }

        return 1;
      });

      const result = await updateClip(
        { ids: cId, arrangementLength: "3:2" },
        mockContext,
      );

      // Source end_marker extended to file boundary: 0 + 8 = 8
      assertSourceClipEndMarker(cId, 8.0);

      // Session clip created for boundary detection (loop_end=1)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        1,
        "/audio/test.wav",
      );

      // Session markers: content from 5 to 8 (3 beats of hidden content)
      expect(sessionClip.set).toHaveBeenCalledWith("loop_end", 8.0);
      expect(sessionClip.set).toHaveBeenCalledWith("loop_start", endTime);
      expect(sessionClip.set).toHaveBeenCalledWith("end_marker", 8.0);
      expect(sessionClip.set).toHaveBeenCalledWith("start_marker", endTime);

      // Tile duplicated from session at current end position
      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id session-temp",
        endTime,
      );

      // Session slot cleaned up
      expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

      expect(result).toStrictEqual([{ id: cId }, { id: tileClipId }]);
      mockCreate.mockRestore();
    },
  );
});

describe("Unlooped warped audio clips - tile when file has sufficient content", () => {
  it("should create tile via session when file content exceeds target", async () => {
    const clipId = "661";
    const tileClipId = "662";
    const endTime = 8.0;

    setupArrangementClipPath(0, [clipId, tileClipId]);

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        warping: 1,
        start_time: 0.0,
        end_time: endTime,
        start_marker: 0.0,
        end_marker: endTime,
        loop_start: 0.0,
        loop_end: endTime,
        name: "Audio Sufficient Content",
        trackIndex: 0,
        file_path: "/audio/test.wav",
      },
    });

    // File boundary = 20, target = 14 → sufficient (20 > 14)
    const { mockCreate, sessionClip, sessionSlot } =
      setupSessionTilingMock(20.0);

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

    // Source end_marker extended to target: 0 + 14 = 14
    assertSourceClipEndMarker(clipId, 14.0);

    // Session clip created for boundary detection (loop_end=1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "/audio/test.wav",
    );

    // Session markers: content from endTime to 14
    expect(sessionClip.set).toHaveBeenCalledWith("loop_end", 14.0);
    expect(sessionClip.set).toHaveBeenCalledWith("loop_start", endTime);
    expect(sessionClip.set).toHaveBeenCalledWith("end_marker", 14.0);
    expect(sessionClip.set).toHaveBeenCalledWith("start_marker", endTime);

    // Tile duplicated from session at current end position
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id session-temp",
      endTime,
    );

    // Session slot cleaned up
    expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

    expect(result).toStrictEqual([{ id: clipId }, { id: tileClipId }]);
    mockCreate.mockRestore();
  });
});

describe("Unlooped warped audio clips - defensive guards", () => {
  it("should not shrink end_marker when clip has more content than target", async () => {
    const clipId = "700";
    const tileClipId = "701";
    const trackIndex = 0;

    setupArrangementClipPath(trackIndex, [clipId, tileClipId]);

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
        end_marker: 40.0, // Content far exceeds target of 14 beats
        loop_start: 0.0,
        loop_end: 40.0,
        name: "Wide Audio Clip",
        trackIndex,
        file_path: "/audio/test.wav",
      },
    });

    // File boundary = 40, target = 14 → sufficient
    const { mockCreate } = setupSessionTilingMock(40.0);

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

    // end_marker should NOT be shrunk from 40 to 14
    expect(liveApiSet).not.toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      expect.anything(),
    );

    // Should still create tile
    expect(result).toStrictEqual([{ id: clipId }, { id: tileClipId }]);
    mockCreate.mockRestore();
  });

  it("should handle zero-length audio content without infinite loop", async () => {
    const clipId = "710";
    const trackIndex = 0;

    setupArrangementClipPath(trackIndex, [clipId]);

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
        end_marker: 0.0, // Zero-length content
        loop_start: 0.0,
        loop_end: 0.0,
        name: "Zero Content Clip",
        trackIndex,
      },
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should return just the source clip (no tiles from zero-length content)
    // unwrapSingleResult returns a single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
  });
});
