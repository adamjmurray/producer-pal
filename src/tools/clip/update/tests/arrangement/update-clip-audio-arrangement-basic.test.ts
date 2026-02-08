// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { liveApiSet, mockLiveApiGet } from "#src/test/mocks/mock-live-api.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  assertDuplicateClipCalled,
  assertRevealedClipMarkers,
  assertSourceClipEndMarker,
  mockContext,
  setupArrangementClipPath,
  setupAudioArrangementTest,
  setupDuplicateClipMock,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Audio clip lengthening uses a tiling approach: the existing content range is
// repeated to fill the target length. When the content offset reaches the end
// of the original range, it wraps back to the start.

describe("Unlooped audio clips - arrangementLength extension", () => {
  // Single-tile cases: sourceEndTime > remaining space (14-8=6), so one tile fills the gap
  // Tile wraps to start of content (offset=sourceEndTime wraps to 0), length=remaining
  const singleTileCases = [
    ["661", "662", 8.0, "Audio No Hidden start==firstStart"],
    ["683", "684", 8.0, "Audio No Hidden start<firstStart"],
  ];

  it.each(singleTileCases)(
    "should tile single chunk to fill remaining space (clip %s: %s)",
    async (clipId, revealedClipId, sourceEndTime, name) => {
      const cId = clipId as string;
      const rId = revealedClipId as string;
      const endTime = sourceEndTime as number;
      const remaining = 14.0 - endTime; // 6.0

      setupAudioArrangementTest({
        trackIndex: 0,
        clipId: cId,
        revealedClipId: rId,
        sourceEndTime: endTime,
        targetLength: 14.0,
        name: name as string,
      });

      const result = await updateClip(
        { ids: cId, arrangementLength: "3:2" },
        mockContext,
      );

      assertSourceClipEndMarker(cId, 14.0);
      // Tile duplicated at current end position
      assertDuplicateClipCalled(cId, endTime);
      // Content wraps to start (0), tile length = remaining space
      assertRevealedClipMarkers(rId, 0, remaining);
      expect(result).toStrictEqual([{ id: cId }, { id: rId }]);
    },
  );

  // Multi-tile cases: sourceEndTime < remaining space (14-5=9), needs 2 tiles
  // Tile 1: full tile (5 beats) wrapping to start, at position 5
  // Tile 2: partial tile (4 beats) wrapping to start, at position 10
  const multiTileCases = [
    ["672", "673", 5.0, "Audio Hidden start==firstStart"],
    ["694", "695", 5.0, "Audio Hidden start<firstStart"],
  ];

  it.each(multiTileCases)(
    "should tile multiple chunks to fill remaining space (clip %s: %s)",
    async (clipId, revealedClipId, sourceEndTime, name) => {
      const cId = clipId as string;
      const rId = revealedClipId as string;
      const endTime = sourceEndTime as number;

      setupAudioArrangementTest({
        trackIndex: 0,
        clipId: cId,
        revealedClipId: rId,
        sourceEndTime: endTime,
        targetLength: 14.0,
        name: name as string,
      });

      const result = await updateClip(
        { ids: cId, arrangementLength: "3:2" },
        mockContext,
      );

      assertSourceClipEndMarker(cId, 14.0);
      // Tile 1: full tile at current end position
      assertDuplicateClipCalled(cId, endTime);
      assertRevealedClipMarkers(rId, 0, endTime);
      // Tile 2: partial tile at position 10 (5+5)
      assertDuplicateClipCalled(cId, endTime * 2);
      // Partial tile: 14 - 10 = 4 beats
      assertRevealedClipMarkers(rId, 0, 14.0 - endTime * 2);
      // Both tiles returned (mock returns same ID for all duplicates)
      expect(result).toStrictEqual([{ id: cId }, { id: rId }, { id: rId }]);
    },
  );
});

describe("Unlooped audio clips - defensive guards", () => {
  it("should not shrink end_marker when clip has more content than target", async () => {
    const clipId = "700";
    const revealedClipId = "701";
    const trackIndex = 0;

    setupArrangementClipPath(trackIndex, [clipId, revealedClipId]);

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
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 8.0,
        end_time: 14.0,
        start_marker: 8.0,
        end_marker: 14.0,
        trackIndex,
      },
    });
    setupDuplicateClipMock(revealedClipId);

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

    // Should still create tiles
    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
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
