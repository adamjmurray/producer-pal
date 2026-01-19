import { describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.js";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.js";
import {
  liveApiCall,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  setupArrangementClipMocks,
  setupArrangementDuplicationMock,
  setupSessionClipPath,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.js";

describe("duplicate - clip duplication", () => {
  it("should throw an error when destination is missing", () => {
    setupSessionClipPath("clip1");
    expect(() => duplicate({ type: "clip", id: "clip1" })).toThrow(
      "duplicate failed: destination is required for type 'clip'",
    );
  });

  it("should throw an error when destination is invalid", () => {
    setupSessionClipPath("clip1");
    expect(() =>
      duplicate({ type: "clip", id: "clip1", destination: "invalid" }),
    ).toThrow(
      "duplicate failed: destination must be 'session' or 'arrangement'",
    );
  });

  describe("session destination", () => {
    it("should duplicate a single clip to the session view", () => {
      setupSessionClipPath("clip1");

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
      setupSessionClipPath("clip1");

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
      setupSessionClipPath("clip1");
      mockLiveApiGet({ clip1: { exists: () => true } });

      expect(() =>
        duplicate({ type: "clip", id: "clip1", destination: "arrangement" }),
      ).toThrow(
        "duplicate failed: arrangementStart, arrangementLocatorId, or arrangementLocatorName is required when destination is 'arrangement'",
      );
    });

    it("should duplicate a single clip to the arrangement view", () => {
      setupSessionClipPath("clip1");
      setupArrangementDuplicationMock({ includeNotes: false });
      setupArrangementClipMocks({ getStartTime: () => 8 });

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
      setupSessionClipPath("clip1");

      let clipCounter = 0;

      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          const clipId = `live_set tracks 0 arrangement_clips ${clipCounter}`;

          clipCounter++;

          return ["id", clipId];
        }

        return null;
      });

      setupArrangementClipMocks({
        getStartTime: (path) => {
          const match = path.match(/arrangement_clips (\d+)/);

          return match ? 8 + Number.parseInt(match[1]) * 4 : 8;
        },
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
