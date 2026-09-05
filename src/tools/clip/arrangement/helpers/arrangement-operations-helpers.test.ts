// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  overrideCall,
  requireMockObject,
  USE_CALL_FALLBACK,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import * as arrangementTilingHelpers from "#src/tools/shared/arrangement/helpers/arrangement-tiling-helpers.ts";
import * as arrangementTiling from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import {
  createMockClip,
  setupArrangementClipPath,
  setupArrangementMocks,
} from "./arrangement-operations-test-helpers.ts";
import {
  type ClipIdResult,
  handleArrangementLengthening,
  handleArrangementShortening,
} from "./arrangement-operations-helpers.ts";

describe("arrangement-operations-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleArrangementLengthening", () => {
    it("should throw error when trackIndex is null", () => {
      const mockClip = createMockClip({ id: "123", trackIndex: null });

      expect(() =>
        handleArrangementLengthening({
          clip: mockClip as unknown as LiveAPI,
          isAudioClip: false,
          arrangementLengthBeats: 16,
          currentArrangementLength: 8,
          currentStartTime: 0,
          currentEndTime: 8,
          context: {},
        }),
      ).toThrow("could not determine trackIndex for clip");
    });

    it("should tile clip when currentArrangementLength > totalContentLength for looped clips", () => {
      // clipProps start_marker 4 → totalContentLength = 8 - 4 = 4.
      // currentArrangementLength (8) > totalContentLength (4) triggers the
      // shortening-then-tiling branch. arrangementLengthBeats (16) > clipLength (8).
      const { tile, result } = runLengthening(
        { start_marker: 4 },
        {
          arrangementLengthBeats: 16,
          currentArrangementLength: 8,
          currentStartTime: 0,
          currentEndTime: 8,
        },
      );

      // Should call createLoopedClipTiles which handles the shortening-then-tiling branch
      expect(tile).toHaveBeenCalled();
      expect(result).toContainEqual({ id: "789" });

      tile.mockRestore();
    });

    it("should handle audio clip shortening with createAudioClipInSession in createLoopedClipTiles", () => {
      const sessionClipId = "session-123";
      const arrangementClipId = "arr-456";
      const clipProps = { start_marker: 4 };

      setupArrangementMocks({
        clipProps,
        extraMocks: { [sessionClipId]: {}, [arrangementClipId]: {} },
      });
      const track = requireMockObject(livePath.track(0));

      const mockCreateAudioClip = vi
        .spyOn(arrangementTilingHelpers, "createAudioClipInSession")
        .mockReturnValue({
          clip: { id: sessionClipId } as unknown as LiveAPI,
          slot: { call: vi.fn() } as unknown as LiveAPI,
        });
      const mockTileClipToRange = vi
        .spyOn(arrangementTiling, "tileClipToRange")
        .mockReturnValue([{ id: "tile1" }]);

      overrideCall(track, (method: string) => {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${arrangementClipId}`;
        }

        return USE_CALL_FALLBACK;
      });

      const mockClip = createMockClip({ props: clipProps });

      handleArrangementLengthening({
        clip: mockClip as unknown as LiveAPI,
        isAudioClip: true, // Audio clip
        arrangementLengthBeats: 16,
        currentArrangementLength: 8, // > totalContentLength (4)
        currentStartTime: 0,
        currentEndTime: 8,
        context: { silenceWavPath: "/test.wav" },
      });

      // Should call createAudioClipInSession for audio clips
      expect(mockCreateAudioClip).toHaveBeenCalled();

      mockCreateAudioClip.mockRestore();
      mockTileClipToRange.mockRestore();
    });

    it("should expose hidden content when arrangementLengthBeats < clipLength for looped clips", () => {
      // clipProps loop_end 16 → clipLength = 16.
      // arrangementLengthBeats (12) < clipLength (16) triggers hidden content exposure
      const { tile, clip, result } = runLengthening(
        { loop_end: 16, end_marker: 16 },
        {
          arrangementLengthBeats: 12,
          currentArrangementLength: 4,
          currentStartTime: 0,
          currentEndTime: 4,
        },
      );

      // Should tile to expose hidden content with adjustPreRoll: false
      expectTiled(
        tile,
        clip,
        4, // currentEndTime
        8, // remainingLength = 12 - 4
        expect.objectContaining({
          adjustPreRoll: false,
          startOffset: 4, // currentOffset (0) + currentArrangementLength (4)
          tileLength: 4, // currentArrangementLength
        }),
      );
      expect(result).toContainEqual({ id: "789" });
      expect(result).toContainEqual({ id: "tile1" });

      tile.mockRestore();
    });

    it("should tile looped clip when currentArrangementLength < totalContentLength", () => {
      // clipProps start_marker 2 → totalContentLength = 8 - 2 = 6.
      // arrangementLengthBeats (16) > clipLength (8)
      // currentArrangementLength (4) < totalContentLength (6)
      const { tile, clip, result } = runLengthening(
        { start_marker: 2 },
        {
          arrangementLengthBeats: 16,
          currentArrangementLength: 4,
          currentStartTime: 0,
          currentEndTime: 4,
        },
      );

      // Should call tileClipToRange with adjustPreRoll: true
      expectTiled(
        tile,
        clip,
        4, // currentEndTime
        12, // remainingLength = 16 - 4
        expect.objectContaining({
          adjustPreRoll: true,
          startOffset: 6, // currentOffset (2) + currentArrangementLength (4)
          tileLength: 4, // currentArrangementLength
        }),
      );
      expect(result).toContainEqual({ id: "789" });

      tile.mockRestore();
    });

    it("computes clipLength as loop_end - loop_start for looped clips", () => {
      // loop_start=2, loop_end=8 → clipLength = 6 (subtraction, not addition=10).
      // arrangementLengthBeats=7 sits between 6 and 10, so with the correct
      // subtraction 7 < 6 is false → tiling branch (adjustPreRoll:true). If the
      // operator were `+`, clipLength=10 → 7 < 10 → expose branch
      // (adjustPreRoll:false).
      const { tile, clip } = runLengthening(
        { loop_start: 2, loop_end: 8, start_marker: 2, end_marker: 8 },
        {
          arrangementLengthBeats: 7,
          currentArrangementLength: 4,
          currentStartTime: 0,
          currentEndTime: 4,
        },
      );

      expectTiled(
        tile,
        clip,
        4,
        3,
        expect.objectContaining({ adjustPreRoll: true }),
      );

      tile.mockRestore();
    });

    it("uses the tiling branch at the exact arrangementLengthBeats == clipLength boundary", () => {
      // clipLength = loop_end(8) - loop_start(0) = 8. At arrangementLengthBeats=8
      // the correct `<` yields 8 < 8 = false → tiling (adjustPreRoll:true).
      // A `<=` mutant would take the expose branch (adjustPreRoll:false).
      const { tile, clip } = runLengthening(
        {},
        {
          arrangementLengthBeats: 8,
          currentArrangementLength: 4,
          currentStartTime: 0,
          currentEndTime: 4,
        },
      );

      expectTiled(
        tile,
        clip,
        4,
        4,
        expect.objectContaining({ adjustPreRoll: true }),
      );

      tile.mockRestore();
    });

    it("derives the expose-branch startOffset from start_marker - loop_start", () => {
      // Expose branch (arrangementLengthBeats 12 < clipLength 14).
      // currentOffset = start_marker(5) - loop_start(2) = 3, so
      // startOffset = currentOffset(3) + currentArrangementLength(4) = 7.
      // An addition mutant would make currentOffset 7 → startOffset 11.
      const { tile, clip } = runLengthening(
        { loop_start: 2, loop_end: 16, start_marker: 5, end_marker: 16 },
        {
          arrangementLengthBeats: 12,
          currentArrangementLength: 4,
          currentStartTime: 0,
          currentEndTime: 4,
        },
      );

      expectTiled(
        tile,
        clip,
        4,
        8,
        expect.objectContaining({
          adjustPreRoll: false,
          startOffset: 7,
          tileLength: 4,
        }),
      );

      tile.mockRestore();
    });

    it("tiles the properly-sized clip when currentArrangementLength == totalContentLength", () => {
      // totalContentLength = loop_end(8) - start_marker(0) = 8, equal to
      // currentArrangementLength(8) → the equal branch. firstTileLength =
      // currentEndTime(10) - currentStartTime(2) = 8, remainingSpace = 20 - 8 =
      // 12, position = currentEndTime(10). The exact options object (no
      // startOffset) also pins the `<` boundary, adjustPreRoll, and the object
      // literal.
      const { tile, clip } = runLengthening(
        {},
        {
          arrangementLengthBeats: 20,
          currentArrangementLength: 8,
          currentStartTime: 2,
          currentEndTime: 10,
        },
      );

      expectTiled(tile, clip, 10, 12, { adjustPreRoll: true, tileLength: 8 });

      tile.mockRestore();
    });

    it("uses the equal branch (not shorten-then-tile) when currentArrangementLength == totalContentLength", () => {
      // At the boundary currentArrangementLength(8) == totalContentLength(8) the
      // correct `>` is false → equal branch: firstTileLength = currentEndTime(20)
      // - currentStartTime(0) = 20, remainingSpace = 30 - 20 = 10, position =
      // currentEndTime(20). A `>=` mutant (or forced-true) would shorten first,
      // producing position=8 instead.
      const { tile, clip } = runLengthening(
        {},
        {
          arrangementLengthBeats: 30,
          currentArrangementLength: 8,
          currentStartTime: 0,
          currentEndTime: 20,
        },
      );

      expectTiled(tile, clip, 20, 10, { adjustPreRoll: true, tileLength: 20 });

      tile.mockRestore();
    });

    it("pins the shorten-then-tile arithmetic when currentArrangementLength > totalContentLength", () => {
      // totalContentLength = loop_end(8) - start_marker(2) = 6 <
      // currentArrangementLength(10) → shorten-then-tile branch.
      //   newEndTime = currentStartTime(1) + totalContentLength(6) = 7
      //   tempClipLength = currentEndTime(11) - newEndTime(7) = 4  → temp clip
      //   firstTileLength = newEndTime(7) - currentStartTime(1) = 6
      //   remainingSpace = arrangementLengthBeats(20) - firstTileLength(6) = 14
      const { tile, clip } = runLengthening(
        { loop_start: 0, loop_end: 8, start_marker: 2, end_marker: 8 },
        {
          arrangementLengthBeats: 20,
          currentArrangementLength: 10,
          currentStartTime: 1,
          currentEndTime: 11,
        },
      );

      const track = requireMockObject(livePath.track(0));

      expect(track.call).toHaveBeenCalledWith("create_midi_clip", 7, 4);
      expectTiled(tile, clip, 7, 14, { adjustPreRoll: true, tileLength: 6 });

      tile.mockRestore();
    });
  });

  describe("handleArrangementShortening", () => {
    it("should throw error when trackIndex is null", () => {
      expect(() =>
        handleArrangementShortening({
          clip: { id: "456", trackIndex: null } as unknown as LiveAPI,
          isAudioClip: false,
          arrangementLengthBeats: 4,
          currentStartTime: 0,
          currentEndTime: 8,
          context: { silenceWavPath: "/test.wav" },
        }),
      ).toThrow("could not determine trackIndex for clip");
    });

    it("should shorten audio clip using createAudioClipInSession", () => {
      const sessionClipId = "session-123";
      const arrangementClipId = "arr-456";

      setupArrangementClipPath("789");
      const track = requireMockObject(livePath.track(0));
      const arrangementClip = registerMockObject(arrangementClipId, {
        path: livePath.track(0).arrangementClip(1),
        type: "Clip",
      });
      const mockSlotCall = vi.fn();

      const mockCreateAudioClip = vi
        .spyOn(arrangementTilingHelpers, "createAudioClipInSession")
        .mockReturnValue({
          clip: { id: sessionClipId } as unknown as LiveAPI,
          slot: { call: mockSlotCall } as unknown as LiveAPI,
        });

      overrideCall(track, (method: string) => {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${arrangementClipId}`;
        }

        return USE_CALL_FALLBACK;
      });

      handleArrangementShortening({
        clip: { id: "789", trackIndex: 0 } as unknown as LiveAPI,
        isAudioClip: true, // Audio clip
        arrangementLengthBeats: 4,
        currentStartTime: 0,
        currentEndTime: 8,
        context: { silenceWavPath: "/test.wav" },
      });

      // Should call createAudioClipInSession for audio clips
      expect(mockCreateAudioClip).toHaveBeenCalledWith(
        expect.anything(),
        4.0, // tempClipLength = 8 - 4 = 4
        "/test.wav",
      );

      // Should set warping, looping, and loop_end on the duplicated arrangement clip
      expect(arrangementClip.set).toHaveBeenCalledWith("warping", 1);
      expect(arrangementClip.set).toHaveBeenCalledWith("looping", 1);
      expect(arrangementClip.set).toHaveBeenCalledWith("loop_end", 4.0);
      expect(mockSlotCall).toHaveBeenCalledWith("delete_clip");
      // The temp arrangement clip is removed via Track.delete_clip by id.
      expect(track.call).toHaveBeenCalledWith("delete_clip", "id arr-456");

      mockCreateAudioClip.mockRestore();
    });

    it("should shorten midi clip using create_midi_clip", () => {
      setupArrangementClipPath("789");
      const track = requireMockObject(livePath.track(0));

      overrideCall(track, (method: string) => {
        if (method === "create_midi_clip") {
          return "id temp-midi";
        }

        return USE_CALL_FALLBACK;
      });

      handleArrangementShortening({
        clip: { id: "789", trackIndex: 0 } as unknown as LiveAPI,
        isAudioClip: false, // MIDI clip
        arrangementLengthBeats: 4,
        currentStartTime: 0,
        currentEndTime: 8,
        context: {},
      });

      // Should call create_midi_clip
      expect(track.call).toHaveBeenCalledWith("create_midi_clip", 4.0, 4.0);
      // Should delete the temp clip
      expect(track.call).toHaveBeenCalledWith("delete_clip", "id temp-midi");
    });
  });
});

interface RunLengtheningArgs {
  arrangementLengthBeats: number;
  currentArrangementLength: number;
  currentStartTime: number;
  currentEndTime: number;
  isAudioClip?: boolean;
}

/**
 * Set up mocks for a looped clip, run handleArrangementLengthening, and return
 * the tileClipToRange spy plus the mock clip for call-argument assertions.
 * @param clipProps - Clip property overrides (loop_start, loop_end, markers)
 * @param args - Lengthening arguments
 * @param args.arrangementLengthBeats - Target length in beats
 * @param args.currentArrangementLength - Current length in beats
 * @param args.currentStartTime - Current start time in beats
 * @param args.currentEndTime - Current end time in beats
 * @param args.isAudioClip - Whether the clip is audio (default false)
 * @returns The tileClipToRange spy, the mock clip, and the returned clip ids
 */
/**
 * Assert tileClipToRange was called for `clip` at `position` with `remaining`
 * beats of space. The track and context arguments are fixed across every
 * lengthening case, so only the position, span, and options vary.
 * @param tile - The tileClipToRange spy from runLengthening
 * @param clip - The mock clip expected as the tiling source
 * @param position - Expected arrangement position of the first tile
 * @param remaining - Expected remaining space in beats
 * @param options - Expected options (an exact object, or an objectContaining matcher)
 */
function expectTiled(
  tile: ReturnType<typeof vi.spyOn>,
  clip: LiveAPI,
  position: number,
  remaining: number,
  options: unknown,
): void {
  expect(tile).toHaveBeenCalledWith(
    clip,
    expect.anything(),
    position,
    remaining,
    expect.anything(),
    options,
  );
}

function runLengthening(
  clipProps: Record<string, number>,
  args: RunLengtheningArgs,
): {
  tile: ReturnType<typeof vi.spyOn>;
  clip: LiveAPI;
  result: ClipIdResult[];
} {
  setupArrangementMocks({ clipProps });

  const tile = vi
    .spyOn(arrangementTiling, "tileClipToRange")
    .mockReturnValue([{ id: "tile1" }]);
  const clip = createMockClip({ props: clipProps }) as unknown as LiveAPI;

  const result = handleArrangementLengthening({
    clip,
    isAudioClip: args.isAudioClip ?? false,
    arrangementLengthBeats: args.arrangementLengthBeats,
    currentArrangementLength: args.currentArrangementLength,
    currentStartTime: args.currentStartTime,
    currentEndTime: args.currentEndTime,
    context: { silenceWavPath: "/test.wav" },
  });

  return { tile, clip, result };
}
