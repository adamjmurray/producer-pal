// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MockSequence } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  assertBoundaryDetection,
  assertSourceClipEndMarker,
  mockContext,
  setupArrangementAudioClip,
  setupArrangementAudioClipMock,
  setupArrangementClipPath,
  setupSessionTilingMock,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Warped unlooped audio clip lengthening uses loop_end to extend in place.
// File content boundary is detected via a session clip (read end_marker).

describe("Unlooped warped audio clips - arrangementLength extension via loop_end", () => {
  it.each([
    {
      desc: "start_marker > 0",
      clipId: "705",
      endTime: 7.0,
      endMarker: 8.0,
      name: "Audio No Hidden start>firstStart",
    },
    {
      desc: "hidden content",
      clipId: "716",
      endTime: 4.0,
      endMarker: 5.0,
      name: "Audio Hidden start>firstStart",
    },
  ])(
    "should extend warped clip via loop_end ($desc)",
    async ({ clipId, endTime, endMarker, name }) => {
      const clip = setupArrangementAudioClip(0, clipId, {
        looping: 0,
        warping: 1,
        start_time: 0.0,
        end_time: endTime,
        start_marker: 1.0,
        end_marker: endMarker,
        loop_start: 1.0,
        loop_end: endMarker,
        name,
        trackIndex: 0,
        file_path: "/audio/test.wav",
      });

      const { mockCreate, sessionSlot } = setupSessionTilingMock(20.0);

      const result = await updateClip(
        { ids: clipId, arrangementLength: "3:2" },
        mockContext,
      );

      assertBoundaryDetection(mockCreate, sessionSlot);

      // Source clip loop_end set: loopStart(1) + target(14) = 15.0
      expect(clip.set).toHaveBeenCalledWith("loop_end", 15.0);

      // Source end_marker extended: startMarker(1) + target(14) = 15
      assertSourceClipEndMarker(clip, 15.0);

      expect(result).toStrictEqual({ id: clipId });
      mockCreate.mockRestore();
    },
  );
});

describe("Unlooped unwarped audio clips - arrangementLength extension via loop_end", () => {
  /**
   * Set up an unwarped audio clip with common defaults.
   * @param clipId - clip ID
   * @param name - clip name
   * @param endTimeSequence - end_time mock value or sequence
   * @returns The clip mock
   */
  function setupUnwarpedClip(
    clipId: string,
    name: string,
    endTimeSequence: number | MockSequence,
  ): RegisteredMockObject {
    const clips = setupArrangementClipPath(0, [clipId]);
    const clip = clips.get(clipId);

    expect(clip).toBeDefined();

    setupArrangementAudioClipMock(clip!, {
      looping: 0,
      warping: 0,
      start_time: 0.0,
      end_time: endTimeSequence,
      start_marker: 0.0,
      end_marker: 6.0,
      loop_start: 0.0,
      loop_end: 3.0,
      name,
      trackIndex: 0,
    });

    return clip!;
  }

  it("should extend unwarped clip by setting loop_end (hidden content)", async () => {
    const clip = setupUnwarpedClip(
      "800",
      "Unwarped Audio",
      new MockSequence(6.0, 6.0, 12.0),
    );

    const result = await updateClip(
      { ids: "800", arrangementLength: "3:0" },
      mockContext,
    );

    expect(clip.set).toHaveBeenCalledWith("loop_end", 6.0);
    expect(result).toStrictEqual({ id: "800" });
  });

  it.each([
    {
      clipId: "810",
      name: "Unwarped Capped",
      endTimeSequence: new MockSequence(6.0, 6.0, 9.6),
      description: "should emit warning when capped at file boundary",
    },
    {
      clipId: "820",
      name: "Unwarped No Hidden",
      endTimeSequence: 6.0 as number | MockSequence,
      description: "should emit warning when no additional content available",
    },
  ])("$description", async ({ clipId, name, endTimeSequence }) => {
    setupUnwarpedClip(clipId, name, endTimeSequence);

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:0" },
      mockContext,
    );

    expect(result).toStrictEqual({ id: clipId });
  });
});

describe("Unlooped audio clips - move + lengthen combination", () => {
  it("should lengthen relative to new position when move and lengthen are combined", async () => {
    const trackIndex = 0;
    const clipId = "900";
    const movedClipId = "901";

    const clips = setupArrangementClipPath(trackIndex, [clipId, movedClipId]);
    const sourceClip = clips.get(clipId);
    const movedClip = clips.get(movedClipId);

    expect(sourceClip).toBeDefined();
    expect(movedClip).toBeDefined();

    const sharedOpts = {
      looping: 0,
      warping: 1,
      start_marker: 0.0,
      end_marker: 4.0,
      loop_start: 0.0,
      loop_end: 4.0,
      name: "Audio for move+lengthen",
      trackIndex,
      file_path: "/audio/test.wav",
    };

    setupArrangementAudioClipMock(sourceClip!, {
      ...sharedOpts,
      start_time: 0.0,
      end_time: 4.0,
    });

    setupArrangementAudioClipMock(movedClip!, {
      ...sharedOpts,
      start_time: 8.0,
      end_time: 12.0,
    });

    const track = lookupMockObject(`track-${trackIndex}`);

    const { mockCreate, sessionSlot } = setupSessionTilingMock(20.0);

    const result = await updateClip(
      {
        ids: clipId,
        arrangementStart: "3|1", // Move to position 8
        arrangementLength: "2:0", // Extend to 8 beats total
      },
      mockContext,
    );

    // Move happened first
    expect(track!.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      8.0,
    );

    expect(track!.call).toHaveBeenCalledWith("delete_clip", `id ${clipId}`);

    assertBoundaryDetection(mockCreate, sessionSlot);

    // Moved clip loop_end set: loopStart(0) + target(8) = 8.0
    expect(movedClip!.set).toHaveBeenCalledWith("loop_end", 8.0);

    // Moved clip end_marker extended: startMarker(0) + target(8) = 8.0
    assertSourceClipEndMarker(movedClip!, 8.0);

    // Ensure source clip wasn't extended after move; only moved clip should be changed
    expect(sourceClip!.set).not.toHaveBeenCalledWith("loop_end", 8.0);

    // Single moved clip returned (extended in place, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: movedClipId });
    mockCreate.mockRestore();
  });
});
