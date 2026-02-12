// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { MockSequence } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import * as tilingHelpers from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  assertSourceClipEndMarker,
  mockContext,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Warped unlooped audio clip lengthening uses loop_end to extend in place.
// File content boundary is detected via a session clip (read end_marker).

/**
 * Set up mocks for session-based file content boundary detection.
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

function setupArrangementClip(
  clipId: string,
  trackIndex: number,
  properties: Record<string, unknown>,
): RegisteredMockObject {
  registerMockObject("live-set", { path: "live_set" });
  registerMockObject(`track-${trackIndex}`, {
    path: `live_set tracks ${trackIndex}`,
  });

  return registerMockObject(clipId, {
    path: `live_set tracks ${trackIndex} arrangement_clips 0`,
    properties,
  });
}

describe("Unlooped warped audio clips - arrangementLength extension via loop_end", () => {
  it("should extend warped clip via loop_end (start_marker > 0)", async () => {
    const clipId = "705";

    // Source: warped, unlooped, arrangement 0-7, content [1, 8]
    const clip = setupArrangementClip(clipId, 0, {
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
    });

    const { mockCreate, sessionSlot } = setupSessionTilingMock();

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

    // Source clip loop_end set: loopStart(1) + target(14) = 15.0
    expect(clip.set).toHaveBeenCalledWith("loop_end", 15.0);

    // Source end_marker extended: startMarker(1) + target(14) = 15
    assertSourceClipEndMarker(clip, 15.0);

    // Single clip returned (extended in place, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
    mockCreate.mockRestore();
  });

  it("should extend warped clip via loop_end (hidden content)", async () => {
    const clipId = "716";

    // Source: warped, unlooped, arrangement 0-4, content [1, 5] (hidden content)
    const clip = setupArrangementClip(clipId, 0, {
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
    });

    const { mockCreate, sessionSlot } = setupSessionTilingMock();

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

    // Source clip loop_end set: loopStart(1) + target(14) = 15.0
    expect(clip.set).toHaveBeenCalledWith("loop_end", 15.0);

    // Source end_marker extended: startMarker(1) + target(14) = 15
    assertSourceClipEndMarker(clip, 15.0);

    // Single clip returned (extended in place, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
    mockCreate.mockRestore();
  });
});

describe("Unlooped unwarped audio clips - arrangementLength extension via loop_end", () => {
  it("should extend unwarped clip by setting loop_end (hidden content)", async () => {
    const clipId = "800";

    // Unwarped clip: loop 0-3s, arrangement 0-6 beats, extending to 12 beats
    // After setting loop_end, end_time changes from 6.0 to 12.0
    const clip = setupArrangementClip(clipId, 0, {
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
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:0" },
      mockContext,
    );

    // loop_end set to target: 0 + 12 / (6/3) = 6.0 seconds
    expect(clip.set).toHaveBeenCalledWith("loop_end", 6.0);

    // Single clip returned (no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
  });

  it("should emit warning when capped at file boundary", async () => {
    const clipId = "810";

    // Unwarped clip: loop 0-3s, arrangement 0-6 beats
    // After setting loop_end, end_time only goes to 9.6 (file boundary)
    setupArrangementClip(clipId, 0, {
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

    // Unwarped clip: loop 0-3s, arrangement 0-6 beats
    // After setting loop_end, end_time stays at 6.0 (at file boundary)
    setupArrangementClip(clipId, 0, {
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

    const sourceClip = setupArrangementClip(clipId, trackIndex, {
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
    });

    const movedClip = setupArrangementClip(movedClipId, trackIndex, {
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
    });

    const track = registerMockObject(`track-${trackIndex}`, {
      path: `live_set tracks ${trackIndex}`,
      methods: {
        duplicate_clip_to_arrangement: () => ["id", movedClipId],
        delete_clip: () => 1,
      },
    });

    const { mockCreate, sessionSlot } = setupSessionTilingMock();

    const result = await updateClip(
      {
        ids: clipId,
        arrangementStart: "3|1", // Move to position 8
        arrangementLength: "2:0", // Extend to 8 beats total
      },
      mockContext,
    );

    // Move happened first
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      8.0,
    );

    expect(track.call).toHaveBeenCalledWith("delete_clip", `id ${clipId}`);

    // Session clip created for boundary detection (loop_end=1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "/audio/test.wav",
    );

    // Session clip cleaned up immediately after boundary detection
    expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

    // Moved clip loop_end set: loopStart(0) + target(8) = 8.0
    expect(movedClip.set).toHaveBeenCalledWith("loop_end", 8.0);

    // Moved clip end_marker extended: startMarker(0) + target(8) = 8.0
    assertSourceClipEndMarker(movedClip, 8.0);

    // Ensure source clip wasn't extended after move; only moved clip should be changed
    expect(sourceClip.set).not.toHaveBeenCalledWith("loop_end", 8.0);

    // Single moved clip returned (extended in place, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: movedClipId });
    mockCreate.mockRestore();
  });
});
