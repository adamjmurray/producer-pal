// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  composeCallOverride,
  requireMockHandle,
  useCallFallback,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import * as arrangementTiling from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import {
  createMockClip,
  setupArrangementClipPath,
  setupArrangementMocks,
} from "./arrangement-operations-test-helpers.ts";
import {
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
          context: { holdingAreaStartBeats: 40000 },
        }),
      ).toThrow("updateClip failed: could not determine trackIndex for clip");
    });

    it("should tile clip when currentArrangementLength > totalContentLength for looped clips", () => {
      const clipProps = { start_marker: 4 }; // totalContentLength = 8-4 = 4

      setupArrangementMocks({ clipProps });

      const mockTileClipToRange = vi
        .spyOn(arrangementTiling, "tileClipToRange")
        .mockReturnValue([{ id: "tile1" }]);

      const mockClip = createMockClip({ props: clipProps });

      // currentArrangementLength (8) > totalContentLength (4) triggers the shortening-then-tiling branch
      const result = handleArrangementLengthening({
        clip: mockClip as unknown as LiveAPI,
        isAudioClip: false,
        arrangementLengthBeats: 16, // > clipLength (8)
        currentArrangementLength: 8, // > totalContentLength (4)
        currentStartTime: 0,
        currentEndTime: 8,
        context: { holdingAreaStartBeats: 40000, silenceWavPath: "/test.wav" },
      });

      // Should call createLoopedClipTiles which handles the shortening-then-tiling branch
      expect(mockTileClipToRange).toHaveBeenCalled();
      expect(result).toContainEqual({ id: "789" });

      mockTileClipToRange.mockRestore();
    });

    it("should handle audio clip shortening with createAudioClipInSession in createLoopedClipTiles", () => {
      const sessionClipId = "session-123";
      const arrangementClipId = "arr-456";
      const clipProps = { start_marker: 4 };

      setupArrangementMocks({
        clipProps,
        extraMocks: { [sessionClipId]: {}, [arrangementClipId]: {} },
      });
      const trackHandle = requireMockHandle("live_set tracks 0");

      const mockCreateAudioClip = vi
        .spyOn(arrangementTiling, "createAudioClipInSession")
        .mockReturnValue({
          clip: { id: sessionClipId } as unknown as LiveAPI,
          slot: { call: vi.fn() } as unknown as LiveAPI,
        });
      const mockTileClipToRange = vi
        .spyOn(arrangementTiling, "tileClipToRange")
        .mockReturnValue([{ id: "tile1" }]);

      composeCallOverride(trackHandle, (method: string) => {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${arrangementClipId}`;
        }

        return useCallFallback;
      });

      const mockClip = createMockClip({ props: clipProps });

      handleArrangementLengthening({
        clip: mockClip as unknown as LiveAPI,
        isAudioClip: true, // Audio clip
        arrangementLengthBeats: 16,
        currentArrangementLength: 8, // > totalContentLength (4)
        currentStartTime: 0,
        currentEndTime: 8,
        context: { holdingAreaStartBeats: 40000, silenceWavPath: "/test.wav" },
      });

      // Should call createAudioClipInSession for audio clips
      expect(mockCreateAudioClip).toHaveBeenCalled();

      mockCreateAudioClip.mockRestore();
      mockTileClipToRange.mockRestore();
    });

    it("should expose hidden content when arrangementLengthBeats < clipLength for looped clips", () => {
      const clipProps = { loop_end: 16, end_marker: 16 }; // clipLength = 16

      setupArrangementMocks({ clipProps });

      const mockTileClipToRange = vi
        .spyOn(arrangementTiling, "tileClipToRange")
        .mockReturnValue([{ id: "tile1" }]);

      const mockClip = createMockClip({ props: clipProps });

      // arrangementLengthBeats (12) < clipLength (16) triggers hidden content exposure
      const result = handleArrangementLengthening({
        clip: mockClip as unknown as LiveAPI,
        isAudioClip: false,
        arrangementLengthBeats: 12, // Less than clipLength (16)
        currentArrangementLength: 4,
        currentStartTime: 0,
        currentEndTime: 4,
        context: { holdingAreaStartBeats: 40000 },
      });

      // Should tile to expose hidden content with adjustPreRoll: false
      expect(mockTileClipToRange).toHaveBeenCalledWith(
        mockClip,
        expect.anything(),
        4, // currentEndTime
        8, // remainingLength = 12 - 4
        40000,
        expect.anything(),
        expect.objectContaining({
          adjustPreRoll: false,
          startOffset: 4, // currentOffset (0) + currentArrangementLength (4)
          tileLength: 4, // currentArrangementLength
        }),
      );
      expect(result).toContainEqual({ id: "789" });
      expect(result).toContainEqual({ id: "tile1" });

      mockTileClipToRange.mockRestore();
    });

    it("should tile looped clip when currentArrangementLength < totalContentLength", () => {
      const clipProps = { start_marker: 2 }; // totalContentLength = 8 - 2 = 6

      setupArrangementMocks({ clipProps });

      const mockTileClipToRange = vi
        .spyOn(arrangementTiling, "tileClipToRange")
        .mockReturnValue([{ id: "tile1" }]);

      const mockClip = createMockClip({ props: clipProps });

      // arrangementLengthBeats (16) > clipLength (8)
      // currentArrangementLength (4) < totalContentLength (6)
      const result = handleArrangementLengthening({
        clip: mockClip as unknown as LiveAPI,
        isAudioClip: false,
        arrangementLengthBeats: 16,
        currentArrangementLength: 4, // < totalContentLength (6)
        currentStartTime: 0,
        currentEndTime: 4,
        context: { holdingAreaStartBeats: 40000 },
      });

      // Should call tileClipToRange with adjustPreRoll: true
      expect(mockTileClipToRange).toHaveBeenCalledWith(
        mockClip,
        expect.anything(),
        4, // currentEndTime
        12, // remainingLength = 16 - 4
        40000,
        expect.anything(),
        expect.objectContaining({
          adjustPreRoll: true,
          startOffset: 6, // currentOffset (2) + currentArrangementLength (4)
          tileLength: 4, // currentArrangementLength
        }),
      );
      expect(result).toContainEqual({ id: "789" });

      mockTileClipToRange.mockRestore();
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
      ).toThrow("updateClip failed: could not determine trackIndex for clip");
    });

    it("should shorten audio clip using createAudioClipInSession", () => {
      const sessionClipId = "session-123";
      const arrangementClipId = "arr-456";

      setupArrangementClipPath("789");
      const trackHandle = requireMockHandle("live_set tracks 0");
      const arrangementClipHandle = registerMockObject(arrangementClipId, {
        path: "live_set tracks 0 arrangement_clips 1",
        type: "Clip",
      });
      const mockSlotCall = vi.fn();

      const mockCreateAudioClip = vi
        .spyOn(arrangementTiling, "createAudioClipInSession")
        .mockReturnValue({
          clip: { id: sessionClipId } as unknown as LiveAPI,
          slot: { call: mockSlotCall } as unknown as LiveAPI,
        });

      composeCallOverride(trackHandle, (method: string) => {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${arrangementClipId}`;
        }

        return useCallFallback;
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
      expect(arrangementClipHandle.set).toHaveBeenCalledWith("warping", 1);
      expect(arrangementClipHandle.set).toHaveBeenCalledWith("looping", 1);
      expect(arrangementClipHandle.set).toHaveBeenCalledWith("loop_end", 4.0);
      expect(mockSlotCall).toHaveBeenCalledWith("delete_clip");

      mockCreateAudioClip.mockRestore();
    });

    it("should shorten midi clip using create_midi_clip", () => {
      setupArrangementClipPath("789");
      const trackHandle = requireMockHandle("live_set tracks 0");

      composeCallOverride(trackHandle, (method: string) => {
        if (method === "create_midi_clip") {
          return "id temp-midi";
        }

        return useCallFallback;
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
      expect(trackHandle.call).toHaveBeenCalledWith(
        "create_midi_clip",
        4.0,
        4.0,
      );
      // Should delete the temp clip
      expect(trackHandle.call).toHaveBeenCalledWith(
        "delete_clip",
        "id temp-midi",
      );
    });
  });
});
