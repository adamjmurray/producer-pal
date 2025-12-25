import { describe, expect, it, vi } from "vitest";
import { duplicate } from "../duplicate.js";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../helpers/duplicate-test-helpers.js";

// Mock updateClip to avoid complex internal logic
vi.mock(import("../../../clip/update/update-clip.js"), () => ({
  updateClip: vi.fn(({ ids }) => {
    // Return array format to simulate tiled clips
    return [{ id: ids }];
  }),
}));

// Mock arrangement-tiling helpers
vi.mock(import("../../../shared/arrangement/arrangement-tiling.js"), () => ({
  createShortenedClipInHolding: vi.fn(() => ({
    holdingClipId: "holding_clip_id",
  })),
  moveClipFromHolding: vi.fn((_holdingClipId, track, _startBeats) => {
    // Return a mock LiveAPI object with necessary methods
    const clipId = `${track.path} arrangement_clips 0`;
    return {
      id: clipId,
      path: clipId,
      set: vi.fn(),
      getProperty: vi.fn((prop) => {
        if (prop === "is_arrangement_clip") {
          return 1;
        }
        if (prop === "start_time") {
          return _startBeats;
        }
        return null;
      }),
      // Add trackIndex getter for getMinimalClipInfo
      get trackIndex() {
        const match = clipId.match(/tracks (\d+)/);
        return match ? parseInt(match[1]) : null;
      },
    };
  }),
}));

describe("duplicate - clip duplication", () => {
  it("should throw an error when destination is missing", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      return this._path;
    });
    expect(() => duplicate({ type: "clip", id: "clip1" })).toThrow(
      "duplicate failed: destination is required for type 'clip'",
    );
  });

  it("should throw an error when destination is invalid", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip1") {
        return "live_set tracks 0 clip_slots 0 clip";
      }
      return this._path;
    });
    expect(() =>
      duplicate({ type: "clip", id: "clip1", destination: "invalid" }),
    ).toThrow(
      "duplicate failed: destination must be 'session' or 'arrangement'",
    );
  });

  describe("session destination", () => {
    it("should duplicate a single clip to the session view", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "session",
        toTrackIndex: 0,
        toSceneIndex: "1",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 0",
        }),
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/1",
      );

      expect(result).toStrictEqual({
        id: "live_set/tracks/0/clip_slots/1/clip",
        trackIndex: 0,
        sceneIndex: 1,
      });
    });

    it("should duplicate multiple clips to session view with comma-separated toSceneIndex", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "session",
        name: "Custom Clip",
        toTrackIndex: 0,
        toSceneIndex: "1,2",
      });

      expect(result).toStrictEqual([
        {
          id: "live_set/tracks/0/clip_slots/1/clip",
          trackIndex: 0,
          sceneIndex: 1,
        },
        {
          id: "live_set/tracks/0/clip_slots/2/clip",
          trackIndex: 0,
          sceneIndex: 2,
        },
      ]);

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 0",
        }),
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/1",
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 0",
        }),
        "duplicate_clip_to",
        "id live_set/tracks/0/clip_slots/2",
      );

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 1 clip",
        }),
        "name",
        "Custom Clip",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 2 clip",
        }),
        "name",
        "Custom Clip 2",
      );
    });

    it("should throw an error when trying to duplicate an arrangement clip to session", () => {
      // Mock an arrangement clip (has trackIndex but no sceneIndex)
      liveApiPath.mockImplementation(function () {
        if (this._id === "arrangementClip1") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        return this._path;
      });

      mockLiveApiGet({
        arrangementClip1: { exists: () => true },
      });

      expect(() =>
        duplicate({
          type: "clip",
          id: "arrangementClip1",
          destination: "session",
          toTrackIndex: 1,
          toSceneIndex: "2",
        }),
      ).toThrow(
        'unsupported duplicate operation: cannot duplicate arrangement clips to the session (source clip id="arrangementClip1" path="live_set tracks 0 arrangement_clips 0") ',
      );
    });
  });

  describe("arrangement destination", () => {
    it("should throw an error when arrangementStartTime is missing", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });
      mockLiveApiGet({ clip1: { exists: () => true } });

      expect(() =>
        duplicate({ type: "clip", id: "clip1", destination: "arrangement" }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementCueId, or arrangementCueName is required when destination is 'arrangement'",
      );
    });

    it("should duplicate a single clip to the arrangement view", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });
      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", "live_set tracks 0 arrangement_clips 0"];
        }
        return null;
      });

      // Mock for getMinimalClipInfo on the new arrangement clip
      const originalPath = liveApiPath.getMockImplementation();
      liveApiPath.mockImplementation(function () {
        if (this._path === "id live_set tracks 0 arrangement_clips 0") {
          return "live_set tracks 0 arrangement_clips 0";
        }
        return originalPath ? originalPath.call(this) : this._path;
      });

      mockLiveApiGet({
        clip1: { exists: () => true },
        "live_set tracks 0 arrangement_clips 0": {
          is_arrangement_clip: 1,
          start_time: 8,
        },
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementStart: "3|1",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );

      expect(result).toStrictEqual({
        id: "live_set tracks 0 arrangement_clips 0",
        trackIndex: 0,
        arrangementStart: "3|1",
      });
    });

    it("should duplicate multiple clips to arrangement view with comma-separated positions", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });
      let clipCounter = 0;
      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          const clipId = `live_set tracks 0 arrangement_clips ${clipCounter}`;
          clipCounter++;
          return ["id", clipId];
        }
        return null;
      });

      // Mock for getMinimalClipInfo on the new arrangement clips
      const originalPath = liveApiPath.getMockImplementation();
      liveApiPath.mockImplementation(function () {
        if (
          this._path.startsWith("id live_set tracks") &&
          this._path.includes("arrangement_clips")
        ) {
          return this._path.slice(3); // Remove "id " prefix
        }
        return originalPath ? originalPath.call(this) : this._path;
      });

      mockLiveApiGet({
        "live_set tracks 0 arrangement_clips 0": {
          is_arrangement_clip: 1,
          start_time: 8,
        },
        "live_set tracks 0 arrangement_clips 1": {
          is_arrangement_clip: 1,
          start_time: 12,
        },
        "live_set tracks 0 arrangement_clips 2": {
          is_arrangement_clip: 1,
          start_time: 16,
        },
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementStart: "3|1,4|1,5|1",
        name: "Custom Clip",
      });

      expect(result).toStrictEqual([
        {
          id: "live_set tracks 0 arrangement_clips 0",
          trackIndex: 0,
          arrangementStart: "3|1",
        },
        {
          id: "live_set tracks 0 arrangement_clips 1",
          trackIndex: 0,
          arrangementStart: "4|1",
        },
        {
          id: "live_set tracks 0 arrangement_clips 2",
          trackIndex: 0,
          arrangementStart: "5|1",
        },
      ]);

      // Clips should be placed at explicit positions
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id clip1",
        12,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id clip1",
        16,
      );
      expect(liveApiCall).toHaveBeenCalledTimes(3); // 3 duplicates
    });
  });
});
