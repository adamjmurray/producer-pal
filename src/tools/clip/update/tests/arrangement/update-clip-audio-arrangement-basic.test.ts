// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  assertBoundaryDetection,
  assertSourceClipEndMarker,
  mockContext,
  setupArrangementAudioClip,
  setupSessionTilingMock,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Warped unlooped audio clip lengthening uses loop_end to extend in place.
// File content boundary is detected via a session clip (read end_marker).
// If the file has no content beyond what's shown, lengthening is skipped.
// If the file has some content but not enough for the target, it's capped.

/**
 * Common audio clip options for unlooped warped clips at start_marker=0.
 * @param endTime - End time and end_marker value
 * @param name - Clip name
 * @param overrides - Optional property overrides
 * @returns Audio clip mock options
 */
function warpedAudioOpts(
  endTime: number,
  name: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    looping: 0,
    warping: 1,
    start_time: 0.0,
    end_time: endTime,
    start_marker: 0.0,
    end_marker: endTime,
    loop_start: 0.0,
    loop_end: endTime,
    name,
    trackIndex: 0,
    file_path: "/audio/test.wav",
    ...overrides,
  };
}

/**
 * Set up a warped audio clip with session tiling mock and run updateClip.
 * Combines the common setup-execute-assert pattern used across audio arrangement tests.
 * @param clipId - Clip ID
 * @param sourceEndTime - End time for the source clip
 * @param name - Clip name
 * @param fileBoundary - File content boundary for session tiling mock
 * @param arrangementLength - Target arrangement length (bar:beat notation)
 * @returns clip mock, updateClip result, mockCreate spy, and sessionSlot mock
 */
async function runWarpedAudioLengthening(
  clipId: string,
  sourceEndTime: number,
  name: string,
  fileBoundary: number,
  arrangementLength: string,
) {
  const clip = setupArrangementAudioClip(
    0,
    clipId,
    warpedAudioOpts(sourceEndTime, name),
  );

  const { mockCreate, sessionSlot } = setupSessionTilingMock(fileBoundary);

  const result = await updateClip(
    { ids: clipId, arrangementLength },
    mockContext,
  );

  assertBoundaryDetection(mockCreate, sessionSlot);

  return { clip, result, mockCreate, sessionSlot };
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

      // File boundary = 8, target = 14 → insufficient
      const { clip, result, mockCreate } = await runWarpedAudioLengthening(
        cId,
        sourceEndTime as number,
        name as string,
        8.0,
        "3:2",
      );

      // Source clip NOT modified (no end_marker extension)
      expect(clip.set).not.toHaveBeenCalledWith(
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

      // File boundary = 8, target = 14 → cap to 8 (partial extension)
      const { clip, result, mockCreate } = await runWarpedAudioLengthening(
        cId,
        sourceEndTime as number,
        name as string,
        8.0,
        "3:2",
      );

      // Source clip loop_end set: loopStart(0) + effectiveTarget(8) = 8.0
      expect(clip.set).toHaveBeenCalledWith("loop_end", 8.0);

      // Source clip end_marker extended: startMarker(0) + effectiveTarget(8) = 8.0
      assertSourceClipEndMarker(clip, 8.0);

      // Single clip returned (extended in place via loop_end, no tiles)
      // unwrapSingleResult returns single object for single-element arrays
      expect(result).toStrictEqual({ id: cId });
      mockCreate.mockRestore();
    },
  );
});

describe("Unlooped warped audio clips - extend when file has sufficient content", () => {
  it("should extend via loop_end when file content exceeds target", async () => {
    // File boundary = 20, target = 14 → sufficient (20 > 14)
    const { clip, result, mockCreate } = await runWarpedAudioLengthening(
      "661",
      8.0,
      "Audio Sufficient Content",
      20.0,
      "3:2",
    );

    // Source clip loop_end set: loopStart(0) + target(14) = 14.0
    expect(clip.set).toHaveBeenCalledWith("loop_end", 14.0);

    // Source end_marker extended to target: 0 + 14 = 14
    assertSourceClipEndMarker(clip, 14.0);

    // Single clip returned (extended in place via loop_end, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: "661" });
    mockCreate.mockRestore();
  });
});

describe("Unlooped warped audio clips - defensive guards", () => {
  it("should not shrink end_marker when clip has more content than target", async () => {
    const clipId = "700";
    const clip = setupArrangementAudioClip(
      0,
      clipId,
      warpedAudioOpts(8.0, "Wide Audio Clip", {
        end_marker: 40.0, // Content far exceeds target of 14 beats
        loop_end: 40.0,
      }),
    );

    // File boundary = 40, target = 14 → sufficient
    const { mockCreate } = setupSessionTilingMock(40.0);

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // end_marker should NOT be shrunk from 40 to 14
    expect(clip.set).not.toHaveBeenCalledWith("end_marker", expect.anything());

    // loop_end set to target: loopStart(0) + 14 = 14.0
    expect(clip.set).toHaveBeenCalledWith("loop_end", 14.0);

    // Single clip returned (extended in place, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
    mockCreate.mockRestore();
  });

  it("should handle zero-length audio content without infinite loop", async () => {
    const clipId = "710";

    setupArrangementAudioClip(
      0,
      clipId,
      warpedAudioOpts(4.0, "Zero Content Clip", {
        end_marker: 0.0, // Zero-length content
        loop_end: 0.0,
      }),
    );

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Should return just the source clip (no tiles from zero-length content)
    // unwrapSingleResult returns a single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
  });
});
