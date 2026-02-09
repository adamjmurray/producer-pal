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

// Audio clip lengthening uses progressive tiling: each tile shows the next
// sequential portion of content (matching MIDI unlooped behavior). Content
// beyond the audio file shows silence.

describe("Unlooped audio clips - arrangementLength extension", () => {
  // Single-tile cases: sourceEndTime > remaining space (14-8=6), so one tile fills the gap
  // Content progresses from end of original (offset=8) forward
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
      // Progressive: content from endTime (8) to targetLength (14)
      assertRevealedClipMarkers(rId, endTime, 14.0);
      expect(result).toStrictEqual([{ id: cId }, { id: rId }]);
    },
  );

  // Multi-tile cases: sourceEndTime < remaining space (14-5=9), needs 2 tiles
  // Tile 1: full tile (5 beats) progressing from offset 5, at position 5
  // Tile 2: partial tile (4 beats) continuing from offset 10, at position 10
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
      // Tile 1: full tile at current end, content [5, 10]
      assertDuplicateClipCalled(cId, endTime);
      assertRevealedClipMarkers(rId, endTime, endTime * 2);
      // Tile 2: partial tile at position 10, content [10, 14]
      assertDuplicateClipCalled(cId, endTime * 2);
      assertRevealedClipMarkers(rId, endTime * 2, 14.0);
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
