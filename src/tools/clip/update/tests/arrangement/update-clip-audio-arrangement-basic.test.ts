// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { type MockObjectHandle } from "#src/test/mocks/mock-registry.ts";
import * as tilingHelpers from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  assertSourceClipEndMarker,
  mockContext,
  setupArrangementClipPath,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Warped unlooped audio clip lengthening uses loop_end to extend in place.
// File content boundary is detected via a session clip (read end_marker).
// If the file has no content beyond what's shown, lengthening is skipped.
// If the file has some content but not enough for the target, it's capped.

/**
 * Set up mocks for session-based file content boundary detection.
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

function setupArrangementClipMock(
  handle: MockObjectHandle,
  props: Record<string, unknown>,
): void {
  handle.get.mockImplementation((prop: string) => {
    const value = props[prop];

    if (value !== undefined) {
      return [value];
    }

    return [0];
  });
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

      const clipHandles = setupArrangementClipPath(0, [cId]);
      const clipHandle = clipHandles.get(cId);

      expect(clipHandle).toBeDefined();

      setupArrangementClipMock(clipHandle!, {
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
      expect(clipHandle!.set).not.toHaveBeenCalledWith(
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
  // File has 3 beats of hidden content → cap to 8 via loop_end
  const hiddenContentCases = [
    ["672", 5.0, "Audio Hidden start==firstStart"],
    ["694", 5.0, "Audio Hidden start<firstStart"],
  ];

  it.each(hiddenContentCases)(
    "should cap and extend via loop_end for hidden content (clip %s: %s)",
    async (clipId, sourceEndTime, name) => {
      const cId = clipId as string;
      const endTime = sourceEndTime as number;

      const clipHandles = setupArrangementClipPath(0, [cId]);
      const clipHandle = clipHandles.get(cId);

      expect(clipHandle).toBeDefined();

      setupArrangementClipMock(clipHandle!, {
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
      });

      // File boundary = 8, target = 14 → cap to 8 (partial extension)
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

      // Session clip cleaned up immediately after boundary detection
      expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

      // Source clip loop_end set: loopStart(0) + effectiveTarget(8) = 8.0
      expect(clipHandle!.set).toHaveBeenCalledWith("loop_end", 8.0);

      // Source clip end_marker extended: startMarker(0) + effectiveTarget(8) = 8.0
      assertSourceClipEndMarker(clipHandle!, 8.0);

      // Single clip returned (extended in place via loop_end, no tiles)
      // unwrapSingleResult returns single object for single-element arrays
      expect(result).toStrictEqual({ id: cId });
      mockCreate.mockRestore();
    },
  );
});

describe("Unlooped warped audio clips - extend when file has sufficient content", () => {
  it("should extend via loop_end when file content exceeds target", async () => {
    const clipId = "661";

    const clipHandles = setupArrangementClipPath(0, [clipId]);
    const clipHandle = clipHandles.get(clipId);

    expect(clipHandle).toBeDefined();

    setupArrangementClipMock(clipHandle!, {
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
      name: "Audio Sufficient Content",
      trackIndex: 0,
      file_path: "/audio/test.wav",
    });

    // File boundary = 20, target = 14 → sufficient (20 > 14)
    const { mockCreate, sessionSlot } = setupSessionTilingMock(20.0);

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Session clip created for boundary detection (loop_end=1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "/audio/test.wav",
    );

    // Session clip cleaned up immediately after boundary detection
    expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

    // Source clip loop_end set: loopStart(0) + target(14) = 14.0
    expect(clipHandle!.set).toHaveBeenCalledWith("loop_end", 14.0);

    // Source end_marker extended to target: 0 + 14 = 14
    assertSourceClipEndMarker(clipHandle!, 14.0);

    // Single clip returned (extended in place via loop_end, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
    mockCreate.mockRestore();
  });
});

describe("Unlooped warped audio clips - defensive guards", () => {
  it("should not shrink end_marker when clip has more content than target", async () => {
    const clipId = "700";
    const trackIndex = 0;

    const clipHandles = setupArrangementClipPath(trackIndex, [clipId]);
    const clipHandle = clipHandles.get(clipId);

    expect(clipHandle).toBeDefined();

    setupArrangementClipMock(clipHandle!, {
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
    });

    // File boundary = 40, target = 14 → sufficient
    const { mockCreate } = setupSessionTilingMock(40.0);

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // end_marker should NOT be shrunk from 40 to 14
    expect(clipHandle!.set).not.toHaveBeenCalledWith(
      "end_marker",
      expect.anything(),
    );

    // loop_end set to target: loopStart(0) + 14 = 14.0
    expect(clipHandle!.set).toHaveBeenCalledWith("loop_end", 14.0);

    // Single clip returned (extended in place, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
    mockCreate.mockRestore();
  });

  it("should handle zero-length audio content without infinite loop", async () => {
    const clipId = "710";
    const trackIndex = 0;

    const clipHandles = setupArrangementClipPath(trackIndex, [clipId]);
    const clipHandle = clipHandles.get(clipId);

    expect(clipHandle).toBeDefined();

    setupArrangementClipMock(clipHandle!, {
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
