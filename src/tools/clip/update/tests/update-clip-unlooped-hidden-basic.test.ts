// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { liveApiSet, mockLiveApiGet } from "#src/test/mocks/mock-live-api.ts";
import {
  assertSourceClipEndMarker,
  mockContext,
  setupArrangementClipPath,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

// Unlooped MIDI clip lengthening uses loop_end to extend arrangement length
// directly. end_marker is extended so notes are visible in the extended region.
// No tiling, no holding area — returns a single clip.

describe("arrangementLength (unlooped MIDI clips extension via loop_end)", () => {
  it("should extend via loop_end and end_marker", async () => {
    const clipId = "800";

    setupArrangementClipPath(0, [clipId]);

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        looping: 0,
        start_time: 0.0,
        end_time: 3.0,
        start_marker: 0.0,
        end_marker: 3.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Test Clip",
        trackIndex: 0,
      },
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" }, // 14 beats
      mockContext,
    );

    // end_marker extended: startMarker(0) + target(14) = 14.0
    assertSourceClipEndMarker(clipId, 14.0);

    // loop_end set: loopStart(0) + target(14) = 14.0
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: clipId }),
      "loop_end",
      14.0,
    );

    // Single clip returned (extended in place, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
  });

  it("should handle start_marker offset correctly", async () => {
    const clipId = "820";

    setupArrangementClipPath(0, [clipId]);

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        looping: 0,
        start_time: 0.0,
        end_time: 3.0,
        start_marker: 1.0,
        end_marker: 4.0,
        loop_start: 1.0,
        loop_end: 4.0,
        name: "Test Clip with offset",
        trackIndex: 0,
      },
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" }, // 14 beats
      mockContext,
    );

    // end_marker extended: startMarker(1) + target(14) = 15.0
    assertSourceClipEndMarker(clipId, 15.0);

    // loop_end set: loopStart(1) + target(14) = 15.0
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: clipId }),
      "loop_end",
      15.0,
    );

    // Single clip returned (extended in place, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
  });

  it("should not shrink end_marker when clip has more content than target", async () => {
    const clipId = "830";

    setupArrangementClipPath(0, [clipId]);

    mockLiveApiGet({
      [clipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 1,
        is_audio_clip: 0,
        looping: 0,
        start_time: 0.0,
        end_time: 3.0,
        start_marker: 0.0,
        end_marker: 20.0,
        loop_start: 0.0,
        loop_end: 20.0,
        name: "Wide Content Clip",
        trackIndex: 0,
      },
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" }, // 14 beats
      mockContext,
    );

    // end_marker should NOT be shrunk from 20 to 14
    expect(liveApiSet).not.toHaveBeenCalledWithThis(
      expect.objectContaining({ id: clipId }),
      "end_marker",
      expect.anything(),
    );

    // loop_end set: loopStart(0) + target(14) = 14.0
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: clipId }),
      "loop_end",
      14.0,
    );

    // Single clip returned (extended in place, no tiles)
    // unwrapSingleResult returns single object for single-element arrays
    expect(result).toStrictEqual({ id: clipId });
  });
});
