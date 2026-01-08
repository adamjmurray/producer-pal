import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall, liveApiPath } from "#src/test/mock-live-api.js";
import { handleArrangementStartOperation } from "./update-clip-arrangement-helpers.js";

describe("update-clip-arrangement-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleArrangementStartOperation", () => {
    it("should warn and return original ID for session clips", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const mockClip = {
        id: "123",
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") {
            return 0; // Session clip
          }

          return null;
        }),
      };

      const tracksWithMovedClips = new Map();

      const result = handleArrangementStartOperation({
        clip: mockClip,
        arrangementStartBeats: 16,
        tracksWithMovedClips,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Warning: arrangementStart parameter ignored for session clip (id 123)",
      );
      expect(result).toBe("123");

      consoleErrorSpy.mockRestore();
    });

    it("should throw error when trackIndex is null for arrangement clips", () => {
      liveApiPath.mockReturnValue("live_set"); // Path without tracks pattern

      const mockClip = {
        id: "456",
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") {
            return 1; // Arrangement clip
          }

          return null;
        }),
        trackIndex: null, // No track index
      };

      const tracksWithMovedClips = new Map();

      expect(() =>
        handleArrangementStartOperation({
          clip: mockClip,
          arrangementStartBeats: 16,
          tracksWithMovedClips,
        }),
      ).toThrow(
        "updateClip failed: could not determine trackIndex for clip 456",
      );
    });

    it("should duplicate clip to new position and delete original", () => {
      const trackIndex = 2;
      const newClipId = "999";

      liveApiPath.mockImplementation(function () {
        if (this._id === "789") {
          return "live_set tracks 2 arrangement_clips 0";
        }

        return this._path;
      });

      liveApiCall.mockImplementation((method) => {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${newClipId}`;
        }
      });

      const mockClip = {
        id: "789",
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") {
            return 1;
          }

          return null;
        }),
        trackIndex,
      };

      const tracksWithMovedClips = new Map();

      const result = handleArrangementStartOperation({
        clip: mockClip,
        arrangementStartBeats: 32,
        tracksWithMovedClips,
      });

      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id 789",
        32,
      );
      expect(liveApiCall).toHaveBeenCalledWith("delete_clip", "id 789");
      expect(result).toBe(newClipId);
      expect(tracksWithMovedClips.get(trackIndex)).toBe(1);
    });

    it("should increment move count for multiple moves on same track", () => {
      const trackIndex = 1;
      const newClipId = "888";

      liveApiPath.mockReturnValue("live_set tracks 1 arrangement_clips 0");

      liveApiCall.mockImplementation((method) => {
        if (method === "duplicate_clip_to_arrangement") {
          return `id ${newClipId}`;
        }
      });

      const mockClip = {
        id: "555",
        getProperty: vi.fn((prop) => {
          if (prop === "is_arrangement_clip") {
            return 1;
          }

          return null;
        }),
        trackIndex,
      };

      // Simulate previous moves on the same track
      const tracksWithMovedClips = new Map([[trackIndex, 2]]);

      handleArrangementStartOperation({
        clip: mockClip,
        arrangementStartBeats: 64,
        tracksWithMovedClips,
      });

      expect(tracksWithMovedClips.get(trackIndex)).toBe(3);
    });
  });
});
