// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  mockContext,
  setupAudioArrangementTest,
  assertSourceClipEndMarker,
  assertDuplicateClipCalled,
  assertRevealedClipMarkers,
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
