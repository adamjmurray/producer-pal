// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import * as audioHelpers from "#src/tools/shared/arrangement/arrangement-audio-helpers.ts";
import * as tilingHelpers from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  assertSourceClipEndMarker,
  mockContext,
  setupArrangementClipPath,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";

// Warped audio clip lengthening uses session-based tiling: a single tile is
// created via createAudioClipInSession with the exact remaining arrangement
// length, because arrangement clip end_time is immutable after creation.

/**
 * Set up mocks for session-based warped audio tiling.
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

describe("Unlooped warped audio clips - arrangementLength extension", () => {
  it("should create single tile via session (start_marker > 0)", async () => {
    const clipId = "705";
    const tileClipId = "706";

    setupArrangementClipPath(0, [clipId, tileClipId]);

    // Source: warped, unlooped, arrangement 0-7, content [1, 8]
    mockLiveApiGet({
      [clipId]: {
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
      },
    });

    const { mockCreate, sessionClip, sessionSlot } = setupSessionTilingMock();

    liveApiCall.mockImplementation(function (method: string) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${tileClipId}`;
      }

      return 1;
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Source end_marker extended: startMarker(1) + target(14) = 15
    assertSourceClipEndMarker(clipId, 15.0);

    // Session clip created for boundary detection (loop_end=1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "/audio/test.wav",
    );

    // Session markers set to content range [8, 15]
    expect(sessionClip.set).toHaveBeenCalledWith("loop_end", 15.0);
    expect(sessionClip.set).toHaveBeenCalledWith("loop_start", 8.0);
    expect(sessionClip.set).toHaveBeenCalledWith("end_marker", 15.0);
    expect(sessionClip.set).toHaveBeenCalledWith("start_marker", 8.0);

    // Tile duplicated from session to arrangement at position 7
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id session-temp",
      7.0,
    );

    // Tile clip unlooped
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _id: tileClipId }),
      "looping",
      0,
    );

    // Session slot cleaned up
    expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

    expect(result).toStrictEqual([{ id: clipId }, { id: tileClipId }]);
    mockCreate.mockRestore();
  });

  it("should create single tile for hidden content (was multiple before fix)", async () => {
    const clipId = "716";
    const tileClipId = "717";

    setupArrangementClipPath(0, [clipId, tileClipId]);

    // Source: warped, unlooped, arrangement 0-4, content [1, 5] (hidden content)
    mockLiveApiGet({
      [clipId]: {
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
      },
    });

    const { mockCreate, sessionClip, sessionSlot } = setupSessionTilingMock();

    liveApiCall.mockImplementation(function (method: string) {
      if (method === "duplicate_clip_to_arrangement") {
        return `id ${tileClipId}`;
      }

      return 1;
    });

    const result = await updateClip(
      { ids: clipId, arrangementLength: "3:2" },
      mockContext,
    );

    // Source end_marker extended: startMarker(1) + target(14) = 15
    assertSourceClipEndMarker(clipId, 15.0);

    // Session clip created for boundary detection (loop_end=1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "/audio/test.wav",
    );

    // Session markers set to content range [5, 15]
    expect(sessionClip.set).toHaveBeenCalledWith("loop_end", 15.0);
    expect(sessionClip.set).toHaveBeenCalledWith("loop_start", 5.0);
    expect(sessionClip.set).toHaveBeenCalledWith("end_marker", 15.0);
    expect(sessionClip.set).toHaveBeenCalledWith("start_marker", 5.0);

    // Single tile duplicated at position 4 (not 3 tiles like before)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id session-temp",
      4.0,
    );

    // Session slot cleaned up
    expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

    // Now 2 clips instead of 4 (source + 1 session-based tile)
    expect(result).toStrictEqual([{ id: clipId }, { id: tileClipId }]);
    mockCreate.mockRestore();
  });
});

describe("Unlooped unwarped audio clips - arrangementLength extension", () => {
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
    const tileClipId = "902";

    liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
      if (this._id && [clipId, movedClipId, tileClipId].includes(this._id)) {
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
        file_path: "/audio/test.wav",
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
        file_path: "/audio/test.wav",
      },
    });

    const { mockCreate, sessionSlot } = setupSessionTilingMock();

    let duplicateCallCount = 0;

    liveApiCall.mockImplementation(function (
      this: MockLiveAPIContext,
      method: string,
    ) {
      if (method === "duplicate_clip_to_arrangement") {
        duplicateCallCount++;

        // First: move, second: tile from session
        return duplicateCallCount === 1
          ? `id ${movedClipId}`
          : `id ${tileClipId}`;
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

    // Session clip created for boundary detection (loop_end=1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      1,
      "/audio/test.wav",
    );

    // Tile duplicated from session at NEW position (12.0)
    expect(liveApiCall).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id session-temp",
      12.0,
    );

    // Session slot cleaned up
    expect(sessionSlot.call).toHaveBeenCalledWith("delete_clip");

    expect(result).toStrictEqual([{ id: movedClipId }, { id: tileClipId }]);
    mockCreate.mockRestore();
  });
});
