import { describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.js";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.js";
import {
  children,
  createStandardMidiClipMock,
  liveApiCall,
  mockLiveApiGet,
  setupArrangementClipMocks,
  setupArrangementDuplicationMock,
  setupScenePath,
  setupSessionClipPath,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.js";

describe("duplicate - locator-based arrangement positioning", () => {
  describe("parameter validation", () => {
    it("should throw error when arrangementStart, arrangementLocatorId, and arrangementLocatorName are all missing", () => {
      setupScenePath("scene1");

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
      setupScenePath("scene1");

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
      setupScenePath("scene1");

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
      setupScenePath("scene1");

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
      setupScenePath("scene1");

      // Mock scene with one clip
      // Note: cue point keys use the id ("cue0", "cue1") from children() helper
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": createStandardMidiClipMock(),
        cue0: { time: 0, name: "Intro" },
        cue1: { time: 16, name: "Verse" },
      });

      setupArrangementDuplicationMock();
      setupArrangementClipMocks();

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
      setupScenePath("scene1");

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1", "cue2"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": createStandardMidiClipMock(),
        cue0: { time: 0, name: "Intro" },
        cue1: { time: 16, name: "Verse" },
        cue2: { time: 32, name: "Chorus" },
      });

      setupArrangementDuplicationMock();
      setupArrangementClipMocks({ getStartTime: () => 32 });

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
    /** Helper to set up mocks for locator-based clip duplication tests */
    function setupLocatorDuplicationMocks(): void {
      setupSessionClipPath("clip1");

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
          cue_points: children("cue0", "cue1"),
        },
        "live_set tracks 0 clip_slots 0 clip": createStandardMidiClipMock({
          length: 4,
          name: "Test Clip",
        }),
        cue0: { time: 0, name: "Start" },
        cue1: { time: 8, name: "Drop" },
      });

      setupArrangementDuplicationMock();
      setupArrangementClipMocks({ getStartTime: () => 8 });
    }

    it("should duplicate a clip to arrangement at locator ID position", () => {
      setupLocatorDuplicationMocks();

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
      setupLocatorDuplicationMocks();

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
    /** Helper to set up common mocks for error handling tests */
    function setupErrorHandlingMocks(): void {
      setupScenePath("scene1");
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
    }

    it("should throw error for non-existent locator ID", () => {
      setupErrorHandlingMocks();

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
      setupErrorHandlingMocks();

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
