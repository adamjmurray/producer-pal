// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  assertBoundaryDetection,
  assertSourceClipEndMarker,
  expectExtendedInPlace,
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
 * @param arrangementLength - Target arrangement length ([<count>bar+]n<fraction> notation)
 * @returns clip mock, updateClip result, mockCreate spy, and clipSlot mock
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

  const { mockCreate, clipSlot } = setupSessionTilingMock(fileBoundary);

  const result = await updateClip(
    { id: clipId, arrangementLength },
    mockContext,
  );

  assertBoundaryDetection(mockCreate, clipSlot);

  return { clip, result, mockCreate, clipSlot };
}

/**
 * runWarpedAudioLengthening for the `it.each` cases, which all share a file
 * boundary of 8 beats and a 14-beat target and receive their row values as
 * `unknown`.
 * @param clipId - Clip ID (row value)
 * @param sourceEndTime - End time for the source clip (row value)
 * @param name - Clip name (row value)
 * @returns clip mock, updateClip result, mockCreate spy, and clipSlot mock
 */
async function runBoundary8Case(
  clipId: unknown,
  sourceEndTime: unknown,
  name: unknown,
) {
  return await runWarpedAudioLengthening(
    clipId as string,
    sourceEndTime as number,
    name as string,
    8.0,
    "3bar+n/2",
  );
}

const NO_MORE_CONTENT = "the audio file has no more content to show";
const NO_AUDIO_SHOWN =
  "arrangementLength unchanged: the clip shows no audio to lengthen";

/**
 * Set up a warped audio clip whose start and end markers meet, so it shows no
 * audio.
 * @param clipId - Clip ID
 */
function setupZeroContentClip(clipId: string): void {
  setupArrangementAudioClip(
    0,
    clipId,
    warpedAudioOpts(4.0, "Zero Content Clip", {
      end_marker: 0.0,
      loop_end: 0.0,
    }),
  );
}

describe("Unlooped warped audio clips - skip when no additional content", () => {
  // These clips show all file content (end_marker = file boundary = 8)
  // No hidden content → nothing to reveal → skip
  const noHiddenCases = [
    ["661", 8.0, "Audio No Hidden start==firstStart"],
    ["683", 8.0, "Audio No Hidden start<firstStart"],
  ];

  it.each(noHiddenCases)(
    "refuses a lone arrangementLength when the file is too short (clip %s: %s)",
    async (clipId, sourceEndTime, name) => {
      const cId = clipId as string;
      const clip = setupArrangementAudioClip(
        0,
        cId,
        warpedAudioOpts(sourceEndTime as number, name as string),
      );
      const { mockCreate } = setupSessionTilingMock(8);

      // File boundary = 8, target = 14 → nothing to add, and nothing else asked
      await expect(
        updateClip({ id: cId, arrangementLength: "3bar+n/2" }, mockContext),
      ).rejects.toThrow(`arrangementLength unchanged: ${NO_MORE_CONTENT}`);
      expect(clip.set).not.toHaveBeenCalledWith(
        "end_marker",
        expect.anything(),
      );
      mockCreate.mockRestore();
    },
  );

  it("keeps the entry, with the reason, when a rename lands beside it", async () => {
    setupArrangementAudioClip(0, "661", warpedAudioOpts(8.0, "No Hidden"));
    const { mockCreate } = setupSessionTilingMock(8);

    const result = await updateClip(
      { id: "661", arrangementLength: "3bar+n/2", name: "Renamed" },
      mockContext,
    );

    expect(result).toStrictEqual({
      id: "661",
      path: "t0[1|1]",
      reason: `arrangementLength unchanged: ${NO_MORE_CONTENT}`,
    });
    mockCreate.mockRestore();
  });
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
      const { clip, result, mockCreate } = await runBoundary8Case(
        cId,
        sourceEndTime,
        name,
      );

      // Source clip loop_end set: loopStart(0) + effectiveTarget(8) = 8.0
      expect(clip.set).toHaveBeenCalledWith("loop_end", 8.0);

      // Source clip end_marker extended: startMarker(0) + effectiveTarget(8) = 8.0
      assertSourceClipEndMarker(clip, 8.0);

      // Single clip returned (extended in place via loop_end, no tiles)
      // unwrapSingleResult returns single object for single-element arrays
      expect(result).toStrictEqual({
        id: cId,
        path: "t0[1|1]",
        reason: `arrangementLength landed at 2bar: ${NO_MORE_CONTENT}`,
      });
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
      "3bar+n/2",
    );

    // Source clip loop_end set: loopStart(0) + target(14) = 14.0
    expect(clip.set).toHaveBeenCalledWith("loop_end", 14.0);

    // Source end_marker extended to target: 0 + 14 = 14
    assertSourceClipEndMarker(clip, 14.0);

    // Single clip returned (extended in place via loop_end, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: "661", path: "t0[1|1]" });
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
      { id: clipId, arrangementLength: "3bar+n/2" },
      mockContext,
    );

    // end_marker stays at 40; loop_end lands on loopStart(0) + target(14).
    expectExtendedInPlace(clip, result, clipId, 14.0);
    mockCreate.mockRestore();
  });

  it("refuses a lone arrangementLength on a clip that shows no audio", async () => {
    setupZeroContentClip("710");

    await expect(
      updateClip({ id: "710", arrangementLength: "3bar+n/2" }, mockContext),
    ).rejects.toThrow(NO_AUDIO_SHOWN);
  });

  it("keeps the zero-content clip's entry, with the reason, when a rename lands", async () => {
    setupZeroContentClip("710");

    const result = await updateClip(
      { id: "710", arrangementLength: "3bar+n/2", name: "Renamed" },
      mockContext,
    );

    expect(result).toStrictEqual({
      id: "710",
      path: "t0[1|1]",
      reason: NO_AUDIO_SHOWN,
    });
  });
});
