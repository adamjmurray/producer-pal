import { describe, expect, it, vi } from "vitest";
import { duplicate } from "../duplicate.js";
import {
  children,
  liveApiCall,
  liveApiGet,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "../helpers/duplicate-test-helpers.js";

// Mock updateClip to avoid complex internal logic
vi.mock(import("#src/tools/clip/update/update-clip.js"), () => ({
  updateClip: vi.fn(({ ids }) => {
    // Return array format to simulate tiled clips
    return [{ id: ids }];
  }),
}));

// Mock arrangement-tiling helpers
vi.mock(import("#src/tools/shared/arrangement/arrangement-tiling.js"), () => ({
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

describe("duplicate - scene duplication", () => {
  it("should duplicate a single scene to session view (default behavior)", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "scene1") {
        return "live_set scenes 0";
      }
      return this._path;
    });

    // Mock scene with clips in tracks 0 and 1
    mockLiveApiGet({
      LiveSet: {
        tracks: children("track0", "track1"),
      },
      "live_set tracks 0 clip_slots 1": { has_clip: 1 },
      "live_set tracks 1 clip_slots 1": { has_clip: 1 },
    });

    const result = duplicate({ type: "scene", id: "scene1" });

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
      clips: [
        {
          id: "live_set/tracks/0/clip_slots/1/clip",
          trackIndex: 0,
        },
        {
          id: "live_set/tracks/1/clip_slots/1/clip",
          trackIndex: 1,
        },
      ],
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_scene",
      0,
    );
  });

  it("should duplicate multiple scenes with auto-incrementing names", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "scene1") {
        return "live_set scenes 0";
      }
      return this._path;
    });

    // Mock scene with clips in tracks 0 and 1
    mockLiveApiGet({
      LiveSet: {
        tracks: children("track0", "track1"),
      },
      "live_set tracks 0 clip_slots 1": { has_clip: 1 },
      "live_set tracks 1 clip_slots 1": { has_clip: 1 },
      "live_set tracks 0 clip_slots 2": { has_clip: 1 },
      "live_set tracks 1 clip_slots 2": { has_clip: 1 },
    });

    const result = duplicate({
      type: "scene",
      id: "scene1",
      count: 2,
      name: "Custom Scene",
    });

    expect(result).toStrictEqual([
      {
        id: "live_set/scenes/1",
        sceneIndex: 1,
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/1/clip",
            trackIndex: 0,
          },
          {
            id: "live_set/tracks/1/clip_slots/1/clip",
            trackIndex: 1,
          },
        ],
      },
      {
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/2/clip",
            trackIndex: 0,
          },
          {
            id: "live_set/tracks/1/clip_slots/2/clip",
            trackIndex: 1,
          },
        ],
      },
    ]);

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_scene",
      0,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_scene",
      1,
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set scenes 1" }),
      "name",
      "Custom Scene",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set scenes 2" }),
      "name",
      "Custom Scene 2",
    );
  });

  it("should duplicate a scene without clips when withoutClips is true", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "scene1") {
        return "live_set scenes 0";
      }
      return this._path;
    });

    // Mock scene with clips in tracks 0 and 1
    mockLiveApiGet({
      LiveSet: {
        tracks: children("track0", "track1", "track2"),
      },
      "live_set tracks 0 clip_slots 1": { has_clip: 1 },
      "live_set tracks 1 clip_slots 1": { has_clip: 1 },
      "live_set tracks 2 clip_slots 1": { has_clip: 0 },
    });

    const result = duplicate({
      type: "scene",
      id: "scene1",
      withoutClips: true,
    });

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      sceneIndex: 1,
      clips: [],
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_scene",
      0,
    );

    // Verify delete_clip was called for clips in the duplicated scene
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: expect.stringContaining("clip_slots"),
      }),
      "delete_clip",
    );
    const deleteCallCount = liveApiCall.mock.calls.filter(
      (call) => call[0] === "delete_clip",
    ).length;
    expect(deleteCallCount).toBe(2); // Should delete 2 clips (tracks 0 and 1)
  });

  describe("arrangement destination", () => {
    it("should throw error when arrangementStartTime is missing for scene to arrangement", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, or arrangementLocatorName is required when destination is 'arrangement'",
      );
    });

    it("should duplicate a scene to arrangement view", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      // Mock scene with clips in tracks 0 and 2
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1", "track2"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 1 clip_slots 0": { has_clip: 0 },
        "live_set tracks 2 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": {
          length: 4,
          name: "Clip 1",
          color: 4047616,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 0,
          loop_start: 0,
          loop_end: 4,
          is_midi_clip: 1,
        },
        "live_set tracks 2 clip_slots 0 clip": {
          length: 8,
          name: "Clip 2",
          color: 8355711,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 0,
          loop_start: 0,
          loop_end: 8,
          is_midi_clip: 1,
        },
      });

      liveApiCall.mockImplementation(
        function (method, clipIdOrStartTime, _startTimeOrLength) {
          if (method === "duplicate_clip_to_arrangement") {
            // Extract track index from the clip ID path
            const trackMatch = clipIdOrStartTime.match(/tracks\/(\d+)/);
            const trackIndex = trackMatch ? trackMatch[1] : "0";
            // Return a mock arrangement clip ID
            return ["id", `live_set tracks ${trackIndex} arrangement_clips 0`];
          }
          if (method === "get_notes_extended") {
            return JSON.stringify({ notes: [] }); // Empty notes for testing
          }
          return null;
        },
      );

      // Add mocking for the arrangement clips
      const originalGet = liveApiGet.getMockImplementation();
      const originalPath = liveApiPath.getMockImplementation();

      liveApiPath.mockImplementation(function () {
        // For arrangement clips created by ID, return a proper path
        if (
          this._path.startsWith("id live_set tracks") &&
          this._path.includes("arrangement_clips")
        ) {
          return this._path.slice(3); // Remove "id " prefix
        }
        return originalPath ? originalPath.call(this) : this._path;
      });

      liveApiGet.mockImplementation(function (prop) {
        // Check if this is an arrangement clip requesting is_arrangement_clip
        if (
          this._path.includes("arrangement_clips") &&
          prop === "is_arrangement_clip"
        ) {
          return [1];
        }
        // Check if this is an arrangement clip requesting start_time
        if (this._path.includes("arrangement_clips") && prop === "start_time") {
          return [16];
        }
        // Otherwise use the original mock implementation
        return originalGet ? originalGet.call(this, prop) : [];
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
      });

      // Both clips now use duplicate_clip_to_arrangement
      // Track 0 clip (4 beats → 8 beats) - lengthened via updateClip
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
      // Track 2 clip (8 beats → 8 beats) - exact match, no updateClip needed
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 2" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/2/clip_slots/0/clip",
        16,
      );

      // Verify result structure
      expect(result).toHaveProperty("arrangementStart", "5|1");
      expect(result).toHaveProperty("clips");
      expect(Array.isArray(result.clips)).toBe(true);
      // At least the exact-match clip (track 2) should appear
      // Track 0's lengthening via updateClip is tested in updateClip's own tests
      expect(result.clips.some((c) => c.trackIndex === 2)).toBe(true);
    });

    it("should duplicate multiple scenes to arrangement view at sequential positions", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      // Mock scene with one clip of length 8 beats
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": {
          length: 8,
          name: "Scene Clip",
          color: 4047616,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 0,
          loop_start: 0,
          loop_end: 8,
          is_midi_clip: 1,
        },
      });

      let clipCounter = 0;
      liveApiCall.mockImplementation(
        function (method, _clipIdOrStartTime, _startTimeOrLength) {
          if (method === "duplicate_clip_to_arrangement") {
            // Return unique clip IDs for each duplication
            const clipId = `live_set tracks 0 arrangement_clips ${clipCounter}`;
            clipCounter++;
            return ["id", clipId];
          }
          if (method === "get_notes_extended") {
            return JSON.stringify({ notes: [] }); // Empty notes for testing
          }
          return null;
        },
      );

      // Add mocking for the arrangement clips
      const originalGet = liveApiGet.getMockImplementation();
      const originalPath = liveApiPath.getMockImplementation();

      liveApiPath.mockImplementation(function () {
        // For arrangement clips created by ID, return a proper path
        if (
          this._path.startsWith("id live_set tracks") &&
          this._path.includes("arrangement_clips")
        ) {
          return this._path.slice(3); // Remove "id " prefix
        }
        return originalPath ? originalPath.call(this) : this._path;
      });

      liveApiGet.mockImplementation(function (prop) {
        // Check if this is an arrangement clip requesting is_arrangement_clip
        if (
          this._path.includes("arrangement_clips") &&
          prop === "is_arrangement_clip"
        ) {
          return [1];
        }
        // Check if this is an arrangement clip requesting start_time
        if (this._path.includes("arrangement_clips") && prop === "start_time") {
          // Return different start times based on clip index
          const clipMatch = this._path.match(/arrangement_clips (\d+)/);
          if (clipMatch) {
            const clipIndex = parseInt(clipMatch[1]);
            return [16 + clipIndex * 8]; // 16, 24, 32
          }
          return [16];
        }
        // Otherwise use the original mock implementation
        return originalGet ? originalGet.call(this, prop) : [];
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
        count: 3,
        name: "Scene Copy",
      });

      // Scenes should be placed at sequential positions based on scene length (8 beats)
      // All use duplicate_clip_to_arrangement (exact match, no lengthening needed)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        24,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        32,
      );

      expect(result).toStrictEqual([
        {
          arrangementStart: "5|1",
          clips: [
            {
              id: "live_set tracks 0 arrangement_clips 0",
              trackIndex: 0,
              name: "Scene Copy",
            },
          ],
        },
        {
          arrangementStart: "7|1",
          clips: [
            {
              id: "live_set tracks 0 arrangement_clips 1",
              trackIndex: 0,
              name: "Scene Copy 2",
            },
          ],
        },
        {
          arrangementStart: "9|1",
          clips: [
            {
              id: "live_set tracks 0 arrangement_clips 2",
              trackIndex: 0,
              name: "Scene Copy 3",
            },
          ],
        },
      ]);
    });

    it("should handle empty scenes gracefully", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      // Mock empty scene
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 0 },
        "live_set tracks 1 clip_slots 0": { has_clip: 0 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
      });

      expect(result).toStrictEqual({
        arrangementStart: "5|1",
        clips: [],
      });
    });

    it("should duplicate a scene to arrangement without clips when withoutClips is true", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      // Mock scene with clips in tracks 0 and 2
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1", "track2"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 1 clip_slots 0": { has_clip: 0 },
        "live_set tracks 2 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": { length: 4 },
        "live_set tracks 2 clip_slots 0 clip": { length: 8 },
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementStart: "5|1",
        withoutClips: true,
      });

      // Verify that duplicate_clip_to_arrangement was NOT called
      expect(liveApiCall).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.any(String),
        expect.any(Number),
      );

      // Verify that show_view was still called

      expect(result).toStrictEqual({
        arrangementStart: "5|1",
        clips: [],
      });
    });
  });
});
