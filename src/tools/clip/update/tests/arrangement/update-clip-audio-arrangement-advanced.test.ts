// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import * as audioHelpers from "#src/tools/shared/arrangement/arrangement-audio-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  assertDuplicateClipCalled,
  assertRevealedClipMarkers,
  assertSourceClipEndMarker,
  mockContext,
  setupArrangementClipPath,
  setupAudioArrangementTest,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Audio clip lengthening uses progressive tiling: each tile shows the next
// sequential portion of content (matching MIDI unlooped behavior). Content
// beyond the audio file shows silence.

describe("Unlooped audio clips - arrangementLength extension", () => {
  it("should tile single chunk with start_marker offset (start_marker > 0)", async () => {
    const clipId = "705";
    const revealedClipId = "706";

    setupAudioArrangementTest({
      trackIndex: 0,
      clipId,
      revealedClipId,
      sourceEndTime: 7.0,
      targetLength: 14.0,
      startMarker: 1.0,
      name: "Audio No Hidden start>firstStart",
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // targetEndMarker = startMarker + targetLength = 1 + 14 = 15
    assertSourceClipEndMarker(clipId, 15.0);
    assertDuplicateClipCalled(clipId, 7.0);
    // Progressive: content from end_marker (8) to targetEndMarker (15)
    assertRevealedClipMarkers(revealedClipId, 8.0, 15.0);
    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
  });

  it("should tile multiple chunks with start_marker offset", async () => {
    const clipId = "716";
    const revealedClipId = "717";

    setupAudioArrangementTest({
      trackIndex: 0,
      clipId,
      revealedClipId,
      sourceEndTime: 4.0,
      targetLength: 14.0,
      startMarker: 1.0,
      name: "Audio Hidden start>firstStart",
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // targetEndMarker = 1 + 14 = 15
    assertSourceClipEndMarker(clipId, 15.0);
    // Progressive: content [1,5] original, tileSize=4, remaining=10 → 3 tiles:
    // Tile 1: content [5, 9] at position 4
    assertDuplicateClipCalled(clipId, 4.0);
    assertRevealedClipMarkers(revealedClipId, 5.0, 9.0);
    // Tile 2: content [9, 13] at position 8
    assertDuplicateClipCalled(clipId, 8.0);
    // Tile 3: partial content [13, 15] (2 beats) at position 12
    assertDuplicateClipCalled(clipId, 12.0);
    assertRevealedClipMarkers(revealedClipId, 13.0, 15.0);
    // 1 source clip + 3 tiles (mock returns same ID for all duplicates)
    expect(result).toStrictEqual([
      { id: clipId },
      { id: revealedClipId },
      { id: revealedClipId },
      { id: revealedClipId },
    ]);
  });

  it("should pass remainingArrangement to limit last unwarped tile", async () => {
    const clipId = "810";
    const revealedClipId = "812";

    setupArrangementClipPath(0, [clipId, revealedClipId]);

    // Unwarped clip: 6 content beats, arrangement 0-6, extending to 10 beats
    mockLiveApiGet({
      [clipId]: {
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
        loop_end: 6.0,
        name: "Unwarped Overshoot",
        trackIndex: 0,
      },
    });

    // Spy on revealAudioContentAtPosition — returns clip ending at target (10)
    const mockReveal = vi
      .spyOn(audioHelpers, "revealAudioContentAtPosition")
      .mockReturnValue({
        id: revealedClipId,
        getProperty: (prop: string) => (prop === "end_time" ? 10.0 : 0),
      } as unknown as LiveAPI);

    // Target 10 beats ("2:2") — remainingArrangement = 4
    const result = await updateClip(
      { ids: clipId, arrangementLength: "2:2" },
      mockContext,
    );

    // Content [6, 12] at position 6, with remainingArrangement=4
    expect(mockReveal).toHaveBeenCalledWith(
      expect.objectContaining({ id: clipId }),
      expect.anything(),
      6.0,
      12.0,
      6.0,
      expect.anything(),
      4.0,
    );

    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
    mockReveal.mockRestore();
  });

  it("should fall back to wrapping when progressive content is exhausted", async () => {
    const clipId = "820";
    const emptyClipId = "821";
    const wrappedClipId = "822";

    setupArrangementClipPath(0, [clipId, emptyClipId, wrappedClipId]);

    // Unwarped clip: 6 content beats, arrangement 0-6, extending to 12 beats
    mockLiveApiGet({
      [clipId]: {
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
        loop_end: 6.0,
        name: "Unwarped Exhausted",
        trackIndex: 0,
      },
    });

    let callCount = 0;
    const mockReveal = vi
      .spyOn(audioHelpers, "revealAudioContentAtPosition")
      .mockImplementation(() => {
        callCount++;

        if (callCount === 1) {
          // Progressive tile: content exhausted → zero arrangement length
          return {
            id: emptyClipId,
            getProperty: (prop: string) => (prop === "end_time" ? 6.0 : 0),
          } as unknown as LiveAPI;
        }

        // Wrapping tile: valid arrangement length
        return {
          id: wrappedClipId,
          getProperty: (prop: string) => (prop === "end_time" ? 12.0 : 0),
        } as unknown as LiveAPI;
      });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:0" },
      mockContext,
    );

    expect(mockReveal).toHaveBeenCalledTimes(2);

    // Progressive call with content [6, 12] — exhausted
    expect(mockReveal).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: clipId }),
      expect.anything(),
      6.0,
      12.0,
      6.0,
      expect.anything(),
      6.0,
    );

    // Wrapping call with source content [0, 6]
    expect(mockReveal).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: clipId }),
      expect.anything(),
      0.0,
      6.0,
      6.0,
      expect.anything(),
      6.0,
    );

    // Empty clip deleted, wrapping tile kept
    expect(liveApiCall).toHaveBeenCalledWith(
      "delete_clip",
      `id ${emptyClipId}`,
    );
    expect(result).toStrictEqual([{ id: clipId }, { id: wrappedClipId }]);
    mockReveal.mockRestore();
  });

  it("should extend unwarped audio clip via revealAudioContentAtPosition", async () => {
    const clipId = "800";
    const revealedClipId = "802";

    setupArrangementClipPath(0, [clipId, revealedClipId]);

    // Unwarped clip: 6 content beats, arrangement 0-6, extending to 12 beats
    mockLiveApiGet({
      [clipId]: {
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
        loop_end: 6.0,
        name: "Unwarped Audio",
        trackIndex: 0,
      },
    });

    // Spy on revealAudioContentAtPosition — returns clip ending at 12
    const mockReveal = vi
      .spyOn(audioHelpers, "revealAudioContentAtPosition")
      .mockReturnValue({
        id: revealedClipId,
        getProperty: (prop: string) => (prop === "end_time" ? 12.0 : 0),
      } as unknown as LiveAPI);

    // Target 12 beats ("3:0") — single tile fills remaining space
    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:0" },
      mockContext,
    );

    // Content [6, 12] at position 6, with remainingArrangement=6
    expect(mockReveal).toHaveBeenCalledWith(
      expect.objectContaining({ id: clipId }),
      expect.anything(),
      6.0,
      12.0,
      6.0,
      expect.anything(),
      6.0,
    );

    expect(result).toStrictEqual([{ id: clipId }, { id: revealedClipId }]);
    mockReveal.mockRestore();
  });
});

describe("Unlooped audio clips - move + lengthen combination", () => {
  it("should lengthen relative to new position when move and lengthen are combined", async () => {
    const trackIndex = 0;
    const clipId = "900";
    const movedClipId = "901";
    const revealedClipId = "902";

    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      if (
        this._id &&
        [clipId, movedClipId, revealedClipId].includes(this._id)
      ) {
        return `live_set tracks ${trackIndex} arrangement_clips 0`;
      }

      if (this._path === "live_set") return "live_set";

      if (this._path === `live_set tracks ${trackIndex}`) {
        return `live_set tracks ${trackIndex}`;
      }

      return this._path;
    });

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
        end_marker: 4.0,
        loop_start: 0.0,
        loop_end: 4.0,
        name: "Audio for move+lengthen",
        trackIndex,
      },
      [movedClipId]: {
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
      },
      [revealedClipId]: {
        is_arrangement_clip: 1,
        is_midi_clip: 0,
        is_audio_clip: 1,
        looping: 0,
        start_time: 12.0,
        end_time: 16.0,
        start_marker: 4.0,
        end_marker: 8.0,
        trackIndex,
      },
    });

    let duplicateCallCount = 0;

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        duplicateCallCount++;

        return duplicateCallCount === 1
          ? `id ${movedClipId}`
          : `id ${revealedClipId}`;
      }

      if (method === "delete_clip") return 1;

      return 1;
    });

    const result = await updateClip(
      {
        ids: clipId,
        arrangementStart: "3|1", // Move to position 8
        arrangementLength: "2:0", // Extend to 8 beats total
      },
      mockContext,
    );

    // Move happened first
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${clipId}`,
      8.0,
    );

    expect(liveApiCall).toHaveBeenCalledWith("delete_clip", `id ${clipId}`);

    // Lengthen: tile at NEW position (12.0, not 4.0)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      `id ${movedClipId}`,
      12.0,
    );

    expect(result).toStrictEqual([{ id: movedClipId }, { id: revealedClipId }]);
  });
});
