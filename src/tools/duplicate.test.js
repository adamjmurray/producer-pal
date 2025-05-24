// src/tools/duplicate.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiSet, mockLiveApiGet } from "../mock-live-api";
import { duplicate } from "./duplicate";

describe("duplicate", () => {
  it("should throw an error when type is missing", () => {
    expect(() => duplicate({ id: "some-id" })).toThrow("duplicate failed: type is required");
  });

  it("should throw an error when id is missing", () => {
    expect(() => duplicate({ type: "track" })).toThrow("duplicate failed: id is required");
  });

  it("should throw an error when type is invalid", () => {
    expect(() => duplicate({ type: "invalid", id: "some-id" })).toThrow(
      "duplicate failed: type must be one of track, scene, clip"
    );
  });

  it("should throw an error when count is less than 1", () => {
    expect(() => duplicate({ type: "track", id: "some-id", count: 0 })).toThrow(
      "duplicate failed: count must be at least 1"
    );
  });

  it("should throw an error when the object doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => duplicate({ type: "track", id: "nonexistent" })).toThrow(
      'duplicate failed: id "nonexistent" does not exist'
    );
  });

  describe("track duplication", () => {
    it("should duplicate a single track (default count)", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "track", id: "track1" });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        count: 1,
        duplicated: true,
        newId: "live_set/tracks/1",
        newTrackIndex: 1,
      });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_track", 0);
      expect(liveApiCall.mock.instances[0].path).toBe("live_set");
    });

    it("should duplicate multiple tracks with auto-incrementing names", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "track", id: "track1", count: 3, name: "Custom Track" });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        count: 3,
        name: "Custom Track",
        duplicated: true,
        objects: [
          {
            newId: "live_set/tracks/1",
            newTrackIndex: 1,
            name: "Custom Track",
          },
          {
            newId: "live_set/tracks/2",
            newTrackIndex: 2,
            name: "Custom Track 2",
          },
          {
            newId: "live_set/tracks/3",
            newTrackIndex: 3,
            name: "Custom Track 3",
          },
        ],
      });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_track", 0);
      expect(liveApiCall).toHaveBeenCalledWith("duplicate_track", 1);
      expect(liveApiCall).toHaveBeenCalledWith("duplicate_track", 2);

      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Track");
      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Track 2");
      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Track 3");
    });
  });

  describe("scene duplication", () => {
    it("should duplicate a single scene", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "scene", id: "scene1" });

      expect(result).toStrictEqual({
        type: "scene",
        id: "scene1",
        count: 1,
        duplicated: true,
        newId: "live_set/scenes/1",
        newSceneIndex: 1,
      });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_scene", 0);
      expect(liveApiCall.mock.instances[0].path).toBe("live_set");
    });

    it("should duplicate multiple scenes with auto-incrementing names", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "scene", id: "scene1", count: 2, name: "Custom Scene" });

      expect(result).toStrictEqual({
        type: "scene",
        id: "scene1",
        count: 2,
        name: "Custom Scene",
        duplicated: true,
        objects: [
          {
            newId: "live_set/scenes/1",
            newSceneIndex: 1,
            name: "Custom Scene",
          },
          {
            newId: "live_set/scenes/2",
            newSceneIndex: 2,
            name: "Custom Scene 2",
          },
        ],
      });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_scene", 0);
      expect(liveApiCall).toHaveBeenCalledWith("duplicate_scene", 1);

      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Scene");
      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Scene 2");
    });
  });

  describe("clip duplication", () => {
    it("should throw an error when destination is missing", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });
      expect(() => duplicate({ type: "clip", id: "clip1" })).toThrow(
        "duplicate failed: destination is required for type 'clip'"
      );
    });

    it("should throw an error when destination is invalid", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });
      expect(() => duplicate({ type: "clip", id: "clip1", destination: "invalid" })).toThrow(
        "duplicate failed: destination must be 'session' or 'arranger'"
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

        const result = duplicate({ type: "clip", id: "clip1", destination: "session" });

        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_slot", 0);
        expect(liveApiCall.mock.instances[0].path).toBe("live_set tracks 0");

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          count: 1,
          destination: "session",
          duplicated: true,
          newId: "live_set/tracks/0/clip_slots/1/clip",
          newTrackIndex: 0,
          newClipSlotIndex: 1,
        });
      });

      it("should duplicate multiple clips to session view with auto-incrementing names", () => {
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
          count: 2,
          name: "Custom Clip",
        });

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          count: 2,
          destination: "session",
          name: "Custom Clip",
          duplicated: true,
          objects: [
            {
              newId: "live_set/tracks/0/clip_slots/1/clip",
              newTrackIndex: 0,
              newClipSlotIndex: 1,
              name: "Custom Clip",
            },
            {
              newId: "live_set/tracks/0/clip_slots/2/clip",
              newTrackIndex: 0,
              newClipSlotIndex: 2,
              name: "Custom Clip 2",
            },
          ],
        });

        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_slot", 0);
        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_slot", 1);

        expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Clip");
        expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Clip 2");
      });
    });

    describe("arranger destination", () => {
      it("should throw an error when arrangerStartTime is missing", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });
        mockLiveApiGet({ clip1: { exists: () => true } });

        expect(() => duplicate({ type: "clip", id: "clip1", destination: "arranger" })).toThrow(
          "duplicate failed: arrangerStartTime is required when destination is 'arranger'"
        );
      });

      it("should duplicate a single clip to the arranger view", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "duplicate_clip_to_arrangement") {
            return ["id", "arranger_clip"];
          }
          return null;
        });
        mockLiveApiGet({ clip1: { exists: () => true } });

        const result = duplicate({
          type: "clip",
          id: "clip1",
          destination: "arranger",
          arrangerStartTime: 8,
        });

        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_to_arrangement", "id clip1", 8);
        expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          count: 1,
          destination: "arranger",
          arrangerStartTime: 8,
          duplicated: true,
          newId: "arranger_clip",
          newTrackIndex: 0,
          newArrangerStartTime: 8,
        });
      });

      it("should duplicate multiple clips to arranger view at sequential positions", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "duplicate_clip_to_arrangement") {
            return ["id", "arranger_clip"];
          }
          return null;
        });
        mockLiveApiGet({
          clip1: { exists: () => true },
          Clip: { length: 4 }, // Mock clip length of 4 beats
        });

        const result = duplicate({
          type: "clip",
          id: "clip1",
          destination: "arranger",
          arrangerStartTime: 8,
          count: 3,
          name: "Custom Clip",
        });

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          count: 3,
          destination: "arranger",
          arrangerStartTime: 8,
          name: "Custom Clip",
          duplicated: true,
          objects: [
            {
              newId: "arranger_clip",
              newTrackIndex: 0,
              newArrangerStartTime: 8, // 8 + (0 * 4)
              name: "Custom Clip",
            },
            {
              newId: "arranger_clip",
              newTrackIndex: 0,
              newArrangerStartTime: 12, // 8 + (1 * 4)
              name: "Custom Clip 2",
            },
            {
              newId: "arranger_clip",
              newTrackIndex: 0,
              newArrangerStartTime: 16, // 8 + (2 * 4)
              name: "Custom Clip 3",
            },
          ],
        });

        // Clips should be placed at sequential positions
        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_to_arrangement", "id clip1", 8);
        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_to_arrangement", "id clip1", 12);
        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_to_arrangement", "id clip1", 16);
        expect(liveApiCall).toHaveBeenCalledTimes(6); // 3 duplicates + 3 show_view calls
      });
    });
  });

  describe("return format", () => {
    it("should return single object format when count=1", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "track", id: "track1", count: 1 });

      expect(result).toMatchObject({
        type: "track",
        id: "track1",
        count: 1,
        duplicated: true,
        // Should have new object metadata directly merged
        newId: expect.any(String),
        newTrackIndex: expect.any(Number),
      });
      expect(result.objects).toBeUndefined();
    });

    it("should return objects array format when count>1", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "track", id: "track1", count: 2 });

      expect(result).toMatchObject({
        type: "track",
        id: "track1",
        count: 2,
        duplicated: true,
        objects: expect.arrayContaining([
          expect.objectContaining({ newTrackIndex: expect.any(Number) }),
          expect.objectContaining({ newTrackIndex: expect.any(Number) }),
        ]),
      });
      expect(result.newTrackIndex).toBeUndefined();
    });
  });
});
