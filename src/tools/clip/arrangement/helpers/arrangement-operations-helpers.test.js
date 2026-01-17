import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.js";
import * as arrangementTiling from "#src/tools/shared/arrangement/arrangement-tiling.js";
import {
  handleArrangementLengthening,
  handleArrangementShortening,
} from "./arrangement-operations-helpers.js";

describe("arrangement-operations-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleArrangementLengthening", () => {
    it("should throw error when trackIndex is null", () => {
      // Mock clip that returns null for trackIndex (path doesn't have tracks pattern)
      liveApiPath.mockReturnValue("live_set");

      mockLiveApiGet({
        123: {
          looping: 1,
          loop_start: 0,
          loop_end: 8,
          start_marker: 0,
          end_marker: 8,
        },
      });

      const mockClip = {
        id: "123",
        getProperty: vi.fn((prop) => {
          const props = {
            looping: 1,
            loop_start: 0,
            loop_end: 8,
            start_marker: 0,
            end_marker: 8,
          };

          return props[prop];
        }),
        trackIndex: null, // Key: trackIndex is null
      };

      expect(() =>
        handleArrangementLengthening({
          clip: mockClip,
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
      const trackIndex = 0;

      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }

        if (this._path?.startsWith("live_set tracks")) {
          return this._path;
        }

        return this._path;
      });

      mockLiveApiGet({
        789: {
          looping: 1,
          loop_start: 0,
          loop_end: 8,
          start_marker: 4, // Note: start_marker is 4, so totalContentLength = 8-4 = 4
          end_marker: 8,
        },
      });

      // Mock tileClipToRange to avoid complex setup
      const mockTileClipToRange = vi
        .spyOn(arrangementTiling, "tileClipToRange")
        .mockReturnValue([{ id: "tile1" }]);

      const mockClip = {
        id: "789",
        getProperty: vi.fn((prop) => {
          const props = {
            looping: 1,
            loop_start: 0,
            loop_end: 8,
            start_marker: 4,
            end_marker: 8,
          };

          return props[prop];
        }),
        trackIndex,
      };

      // currentArrangementLength (8) > totalContentLength (4) triggers the shortening-then-tiling branch
      const result = handleArrangementLengthening({
        clip: mockClip,
        isAudioClip: false,
        arrangementLengthBeats: 16, // > clipLength (8)
        currentArrangementLength: 8, // > totalContentLength (4)
        currentStartTime: 0,
        currentEndTime: 8,
        context: { holdingAreaStartBeats: 40000, silenceWavPath: "/test.wav" },
      });

      // Should call createLoopeClipTiles which handles the shortening-then-tiling branch
      expect(mockTileClipToRange).toHaveBeenCalled();
      expect(result).toContainEqual({ id: "789" });

      mockTileClipToRange.mockRestore();
    });

    it("should handle audio clip shortening with createAudioClipInSession in createLoopeClipTiles", () => {
      const trackIndex = 0;
      const sessionClipId = "session-123";
      const arrangementClipId = "arr-456";

      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }

        return this._path;
      });

      mockLiveApiGet({
        789: {
          looping: 1,
          loop_start: 0,
          loop_end: 8,
          start_marker: 4,
          end_marker: 8,
        },
        [sessionClipId]: {},
        [arrangementClipId]: {},
      });

      // Mock createAudioClipInSession
      const mockCreateAudioClip = vi
        .spyOn(arrangementTiling, "createAudioClipInSession")
        .mockReturnValue({
          clip: { id: sessionClipId },
          slot: { call: vi.fn() },
        });

      // Mock tileClipToRange
      const mockTileClipToRange = vi
        .spyOn(arrangementTiling, "tileClipToRange")
        .mockReturnValue([{ id: "tile1" }]);

      liveApiCall.mockImplementation((method) => {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${arrangementClipId}`;
        }
      });

      const mockClip = {
        id: "789",
        getProperty: vi.fn((prop) => {
          const props = {
            looping: 1,
            loop_start: 0,
            loop_end: 8,
            start_marker: 4,
            end_marker: 8,
          };

          return props[prop];
        }),
        trackIndex,
      };

      handleArrangementLengthening({
        clip: mockClip,
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
      const trackIndex = 0;

      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }

        if (this._path?.startsWith("live_set tracks")) {
          return this._path;
        }

        return this._path;
      });

      mockLiveApiGet({
        789: {
          looping: 1,
          loop_start: 0,
          loop_end: 16, // clipLength = 16 (loop_end - loop_start)
          start_marker: 0,
          end_marker: 16,
        },
      });

      // Mock tileClipToRange
      const mockTileClipToRange = vi
        .spyOn(arrangementTiling, "tileClipToRange")
        .mockReturnValue([{ id: "tile1" }]);

      const mockClip = {
        id: "789",
        getProperty: vi.fn((prop) => {
          const props = {
            looping: 1,
            loop_start: 0,
            loop_end: 16,
            start_marker: 0,
            end_marker: 16,
          };

          return props[prop];
        }),
        trackIndex,
      };

      // arrangementLengthBeats (12) < clipLength (16) triggers hidden content exposure
      const result = handleArrangementLengthening({
        clip: mockClip,
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
      const trackIndex = 0;

      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }

        return this._path;
      });

      mockLiveApiGet({
        789: {
          looping: 1,
          loop_start: 0,
          loop_end: 8, // clipLength = 8
          start_marker: 2, // totalContentLength = loop_end - start_marker = 8 - 2 = 6
          end_marker: 8,
        },
      });

      const mockTileClipToRange = vi
        .spyOn(arrangementTiling, "tileClipToRange")
        .mockReturnValue([{ id: "tile1" }]);

      const mockClip = {
        id: "789",
        getProperty: vi.fn((prop) => {
          const props = {
            looping: 1,
            loop_start: 0,
            loop_end: 8,
            start_marker: 2,
            end_marker: 8,
          };

          return props[prop];
        }),
        trackIndex,
      };

      // arrangementLengthBeats (16) > clipLength (8)
      // currentArrangementLength (4) < totalContentLength (6)
      const result = handleArrangementLengthening({
        clip: mockClip,
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
      liveApiPath.mockReturnValue("live_set");

      const mockClip = {
        id: "456",
        trackIndex: null,
      };

      expect(() =>
        handleArrangementShortening({
          clip: mockClip,
          isAudioClip: false,
          arrangementLengthBeats: 4,
          currentStartTime: 0,
          currentEndTime: 8,
          context: { silenceWavPath: "/test.wav" },
        }),
      ).toThrow("updateClip failed: could not determine trackIndex for clip");
    });

    it("should shorten audio clip using createAudioClipInSession", () => {
      const trackIndex = 0;
      const sessionClipId = "session-123";
      const arrangementClipId = "arr-456";

      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }

        return this._path;
      });

      // Mock createAudioClipInSession
      const mockCreateAudioClip = vi
        .spyOn(arrangementTiling, "createAudioClipInSession")
        .mockReturnValue({
          clip: { id: sessionClipId },
          slot: { call: vi.fn() },
        });

      liveApiCall.mockImplementation((method) => {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${arrangementClipId}`;
        }
      });

      liveApiSet.mockImplementation(() => {});

      const mockClip = {
        id: "789",
        trackIndex,
      };

      handleArrangementShortening({
        clip: mockClip,
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

      // Should set warping, looping, and loop_end on the temp clip
      expect(liveApiSet).toHaveBeenCalledWith("warping", 1);
      expect(liveApiSet).toHaveBeenCalledWith("looping", 1);
      expect(liveApiSet).toHaveBeenCalledWith("loop_end", 4.0);

      mockCreateAudioClip.mockRestore();
    });

    it("should shorten midi clip using create_midi_clip", () => {
      const trackIndex = 0;

      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 0 arrangement_clips 0";
        }

        return this._path;
      });

      liveApiCall.mockImplementation((method) => {
        if (method === "create_midi_clip") {
          return "id temp-midi";
        }
      });

      const mockClip = {
        id: "789",
        trackIndex,
      };

      handleArrangementShortening({
        clip: mockClip,
        isAudioClip: false, // MIDI clip
        arrangementLengthBeats: 4,
        currentStartTime: 0,
        currentEndTime: 8,
        context: {},
      });

      // Should call create_midi_clip
      expect(liveApiCall).toHaveBeenCalledWith("create_midi_clip", 4.0, 4.0);
      // Should delete the temp clip
      expect(liveApiCall).toHaveBeenCalledWith("delete_clip", "id temp-midi");
    });
  });
});
