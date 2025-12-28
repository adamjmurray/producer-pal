import { describe, expect, it, vi } from "vitest";
import { duplicate } from "../duplicate.js";
import {
  children,
  liveApiCall,
  liveApiGet,
  liveApiPath,
  mockLiveApiGet,
} from "../helpers/duplicate-test-helpers.js";

// Mock updateClip to avoid complex internal logic
vi.mock(import("#src/tools/clip/update/update-clip.js"), () => ({
  updateClip: vi.fn(({ ids }) => {
    return [{ id: ids }];
  }),
}));

// Mock arrangement-tiling helpers
vi.mock(import("#src/tools/shared/arrangement/arrangement-tiling.js"), () => ({
  createShortenedClipInHolding: vi.fn(() => ({
    holdingClipId: "holding_clip_id",
  })),
  moveClipFromHolding: vi.fn((_holdingClipId, track, _startBeats) => {
    const clipId = `${track.path} arrangement_clips 0`;

    return {
      id: clipId,
      path: clipId,
      set: vi.fn(),
      getProperty: vi.fn((prop) => {
        if (prop === "is_arrangement_clip") return 1;
        if (prop === "start_time") return _startBeats;

        return null;
      }),
      get trackIndex() {
        const match = clipId.match(/tracks (\d+)/);

        return match ? parseInt(match[1]) : null;
      },
    };
  }),
}));

describe("duplicate - locator-based arrangement positioning", () => {
  describe("parameter validation", () => {
    it("should throw error when arrangementStart, arrangementLocatorId, and arrangementLocatorName are all missing", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") return "live_set scenes 0";

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

    it("should throw error when arrangementStart and arrangementLocatorId are both provided", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") return "live_set scenes 0";

        return this._path;
      });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStart: "5|1",
          arrangementLocatorId: "locator-0",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, and arrangementLocatorName are mutually exclusive",
      );
    });

    it("should throw error when arrangementStart and arrangementLocatorName are both provided", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") return "live_set scenes 0";

        return this._path;
      });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementStart: "5|1",
          arrangementLocatorName: "Verse",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, and arrangementLocatorName are mutually exclusive",
      );
    });

    it("should throw error when arrangementLocatorId and arrangementLocatorName are both provided", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") return "live_set scenes 0";

        return this._path;
      });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementLocatorId: "locator-0",
          arrangementLocatorName: "Verse",
        }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, and arrangementLocatorName are mutually exclusive",
      );
    });
  });

  describe("scene duplication with locator", () => {
    it("should duplicate a scene to arrangement at locator ID position", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") return "live_set scenes 0";

        return this._path;
      });

      // Mock scene with one clip
      // Note: cue point keys use the id ("cue0", "cue1") from children() helper
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1"),
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
        cue0: { time: 0, name: "Intro" },
        cue1: { time: 16, name: "Verse" },
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", "live_set tracks 0 arrangement_clips 0"];
        }

        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] });
        }

        return null;
      });

      // Add mocking for the arrangement clips
      const originalGet = liveApiGet.getMockImplementation();
      const originalPath = liveApiPath.getMockImplementation();

      liveApiPath.mockImplementation(function () {
        if (
          this._path.startsWith("id live_set tracks") &&
          this._path.includes("arrangement_clips")
        ) {
          return this._path.slice(3);
        }

        return originalPath ? originalPath.call(this) : this._path;
      });

      liveApiGet.mockImplementation(function (prop) {
        if (
          this._path.includes("arrangement_clips") &&
          prop === "is_arrangement_clip"
        ) {
          return [1];
        }

        if (this._path.includes("arrangement_clips") && prop === "start_time") {
          return [16];
        }

        return originalGet ? originalGet.call(this, prop) : [];
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementLocatorId: "locator-1",
      });

      // Should duplicate at locator-1's position (16 beats = 5|1)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );

      expect(result).toHaveProperty("arrangementStart", "5|1");
      expect(result).toHaveProperty("clips");
    });

    it("should duplicate a scene to arrangement at locator name position", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") return "live_set scenes 0";

        return this._path;
      });

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1", "cue2"),
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
        cue0: { time: 0, name: "Intro" },
        cue1: { time: 16, name: "Verse" },
        cue2: { time: 32, name: "Chorus" },
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", "live_set tracks 0 arrangement_clips 0"];
        }

        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] });
        }

        return null;
      });

      const originalGet = liveApiGet.getMockImplementation();
      const originalPath = liveApiPath.getMockImplementation();

      liveApiPath.mockImplementation(function () {
        if (
          this._path.startsWith("id live_set tracks") &&
          this._path.includes("arrangement_clips")
        ) {
          return this._path.slice(3);
        }

        return originalPath ? originalPath.call(this) : this._path;
      });

      liveApiGet.mockImplementation(function (prop) {
        if (
          this._path.includes("arrangement_clips") &&
          prop === "is_arrangement_clip"
        ) {
          return [1];
        }

        if (this._path.includes("arrangement_clips") && prop === "start_time") {
          return [32];
        }

        return originalGet ? originalGet.call(this, prop) : [];
      });

      const result = duplicate({
        type: "scene",
        id: "scene1",
        destination: "arrangement",
        arrangementLocatorName: "Chorus",
      });

      // Should duplicate at Chorus position (32 beats = 9|1)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        32,
      );

      expect(result).toHaveProperty("arrangementStart", "9|1");
    });
  });

  describe("clip duplication with locator", () => {
    it("should duplicate a clip to arrangement at locator ID position", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") return "live_set tracks 0 clip_slots 0 clip";

        return this._path;
      });

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1"),
        },
        "live_set tracks 0 clip_slots 0 clip": {
          length: 4,
          name: "Test Clip",
          color: 4047616,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 0,
          loop_start: 0,
          loop_end: 4,
          is_midi_clip: 1,
        },
        cue0: { time: 0, name: "Start" },
        cue1: { time: 8, name: "Drop" },
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", "live_set tracks 0 arrangement_clips 0"];
        }

        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] });
        }

        return null;
      });

      const originalGet = liveApiGet.getMockImplementation();
      const originalPath = liveApiPath.getMockImplementation();

      liveApiPath.mockImplementation(function () {
        if (
          this._path.startsWith("id live_set tracks") &&
          this._path.includes("arrangement_clips")
        ) {
          return this._path.slice(3);
        }

        return originalPath ? originalPath.call(this) : this._path;
      });

      liveApiGet.mockImplementation(function (prop) {
        if (
          this._path.includes("arrangement_clips") &&
          prop === "is_arrangement_clip"
        ) {
          return [1];
        }

        if (this._path.includes("arrangement_clips") && prop === "start_time") {
          return [8];
        }

        return originalGet ? originalGet.call(this, prop) : [];
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementLocatorId: "locator-1",
      });

      // Should duplicate at locator-1's position (8 beats = 3|1)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );

      expect(result).toHaveProperty("arrangementStart", "3|1");
    });

    it("should duplicate a clip to arrangement at locator name position", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") return "live_set tracks 0 clip_slots 0 clip";

        return this._path;
      });

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1"),
        },
        "live_set tracks 0 clip_slots 0 clip": {
          length: 4,
          name: "Test Clip",
          color: 4047616,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 0,
          loop_start: 0,
          loop_end: 4,
          is_midi_clip: 1,
        },
        cue0: { time: 0, name: "Start" },
        cue1: { time: 8, name: "Drop" },
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", "live_set tracks 0 arrangement_clips 0"];
        }

        if (method === "get_notes_extended") {
          return JSON.stringify({ notes: [] });
        }

        return null;
      });

      const originalGet = liveApiGet.getMockImplementation();
      const originalPath = liveApiPath.getMockImplementation();

      liveApiPath.mockImplementation(function () {
        if (
          this._path.startsWith("id live_set tracks") &&
          this._path.includes("arrangement_clips")
        ) {
          return this._path.slice(3);
        }

        return originalPath ? originalPath.call(this) : this._path;
      });

      liveApiGet.mockImplementation(function (prop) {
        if (
          this._path.includes("arrangement_clips") &&
          prop === "is_arrangement_clip"
        ) {
          return [1];
        }

        if (this._path.includes("arrangement_clips") && prop === "start_time") {
          return [8];
        }

        return originalGet ? originalGet.call(this, prop) : [];
      });

      const result = duplicate({
        type: "clip",
        id: "clip1",
        destination: "arrangement",
        arrangementLocatorName: "Drop",
      });

      // Should duplicate at Drop position (8 beats = 3|1)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "duplicate_clip_to_arrangement",
        "id clip1",
        8,
      );

      expect(result).toHaveProperty("arrangementStart", "3|1");
    });
  });

  describe("error handling", () => {
    it("should throw error for non-existent locator ID", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") return "live_set scenes 0";

        return this._path;
      });

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
          cue_points: children("cue0"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": {
          length: 8,
          signature_numerator: 4,
          signature_denominator: 4,
        },
        cue0: { time: 0, name: "Intro" },
      });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementLocatorId: "locator-5",
        }),
      ).toThrow("duplicate failed: locator not found: locator-5");
    });

    it("should throw error for non-existent locator name", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") return "live_set scenes 0";

        return this._path;
      });

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
          cue_points: children("cue0"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": {
          length: 8,
          signature_numerator: 4,
          signature_denominator: 4,
        },
        cue0: { time: 0, name: "Intro" },
      });

      expect(() =>
        duplicate({
          type: "scene",
          id: "scene1",
          destination: "arrangement",
          arrangementLocatorName: "NonExistent",
        }),
      ).toThrow('duplicate failed: no locator found with name "NonExistent"');
    });
  });
});
