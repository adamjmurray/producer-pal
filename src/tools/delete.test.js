// src/tools/delete.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiType } from "../mock-live-api";
import { deleteObject } from "./delete";

describe("deleteObject", () => {
  it("should delete a single track when type is 'track'", () => {
    const id = "track_2";
    const trackIndex = 1;
    const path = `live_set tracks ${trackIndex}`;
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case path:
          return id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case id:
          return path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (this._id === id) return "Track";
    });

    const result = deleteObject({ ids: id, type: "track" });

    expect(result).toEqual({ id, type: "track", deleted: true });
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_track", trackIndex);
    expect(liveApiCall.mock.instances[0].path).toBe("live_set");
  });

  it("should delete multiple tracks in descending index order", () => {
    const ids = "track_0,track_1,track_2";
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0":
          return "track_0";
        case "live_set tracks 1":
          return "track_1";
        case "live_set tracks 2":
          return "track_2";
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "track_0":
          return "live_set tracks 0";
        case "track_1":
          return "live_set tracks 1";
        case "track_2":
          return "live_set tracks 2";
      }
    });
    liveApiType.mockImplementation(function () {
      if (["track_0", "track_1", "track_2"].includes(this._id)) return "Track";
    });

    const result = deleteObject({ ids, type: "track" });

    // Should delete in descending order (2, 1, 0) to maintain indices
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_track", 2);
    expect(liveApiCall).toHaveBeenNthCalledWith(2, "delete_track", 1);
    expect(liveApiCall).toHaveBeenNthCalledWith(3, "delete_track", 0);

    expect(result).toEqual([
      { id: "track_2", type: "track", deleted: true },
      { id: "track_1", type: "track", deleted: true },
      { id: "track_0", type: "track", deleted: true },
    ]);
  });

  it("should delete a single scene when type is 'scene'", () => {
    const id = "scene_2";
    const sceneIndex = 1;
    const path = `live_set scenes ${sceneIndex}`;
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case path:
          return id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case id:
          return path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (this._id === id) return "Scene";
    });

    const result = deleteObject({ ids: id, type: "scene" });

    expect(result).toEqual({ id, type: "scene", deleted: true });
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_scene", sceneIndex);
    expect(liveApiCall.mock.instances[0].path).toBe("live_set");
  });

  it("should delete multiple scenes in descending index order", () => {
    const ids = "scene_0, scene_2";
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set scenes 0":
          return "scene_0";
        case "live_set scenes 2":
          return "scene_2";
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "scene_0":
          return "live_set scenes 0";
        case "scene_2":
          return "live_set scenes 2";
      }
    });
    liveApiType.mockImplementation(function () {
      if (["scene_0", "scene_2"].includes(this._id)) return "Scene";
    });

    const result = deleteObject({ ids, type: "scene" });

    // Should delete in descending order (2, 0) to maintain indices
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_scene", 2);
    expect(liveApiCall).toHaveBeenNthCalledWith(2, "delete_scene", 0);

    expect(result).toEqual([
      { id: "scene_2", type: "scene", deleted: true },
      { id: "scene_0", type: "scene", deleted: true },
    ]);
  });

  it("should delete multiple clips (order doesn't matter for clips)", () => {
    const ids = "clip_0_0,clip_1_1";
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip_0_0";
        case "live_set tracks 1 clip_slots 1 clip":
          return "clip_1_1";
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "clip_0_0":
          return "live_set tracks 0 clip_slots 0 clip";
        case "clip_1_1":
          return "live_set tracks 1 clip_slots 1 clip";
      }
    });
    liveApiType.mockImplementation(function () {
      if (["clip_0_0", "clip_1_1"].includes(this._id)) return "Clip";
    });

    const result = deleteObject({ ids, type: "clip" });

    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_clip", "id clip_0_0");
    expect(liveApiCall).toHaveBeenNthCalledWith(2, "delete_clip", "id clip_1_1");
    expect(liveApiCall.mock.instances[0].path).toBe("live_set tracks 0");
    expect(liveApiCall.mock.instances[1].path).toBe("live_set tracks 1");

    expect(result).toEqual([
      { id: "clip_0_0", type: "clip", deleted: true },
      { id: "clip_1_1", type: "clip", deleted: true },
    ]);
  });

  it("should throw an error when ids arg is missing", () => {
    const expectedError = "delete failed: ids is required";
    expect(() => deleteObject()).toThrow(expectedError);
    expect(() => deleteObject({})).toThrow(expectedError);
    expect(() => deleteObject({ type: "clip" })).toThrow(expectedError);
  });

  it("should throw an error when type arg is missing", () => {
    const expectedError = "delete failed: type is required";
    expect(() => deleteObject({ ids: "clip_1" })).toThrow(expectedError);
  });

  it("should throw an error when type arg is invalid", () => {
    const expectedError = 'delete failed: type must be one of "track", "scene", or "clip"';
    expect(() => deleteObject({ ids: "clip_1", type: "invalid" })).toThrow(expectedError);
  });

  it("should throw an error when any object doesn't exist", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id existing":
          return "existing";
        case "id nonexistent":
          return "id 0";
      }
    });
    liveApiType.mockImplementation(function () {
      if (this._id === "existing") return "Track";
    });

    expect(() => deleteObject({ ids: "existing, nonexistent", type: "track" })).toThrow(
      'delete failed: id "nonexistent" does not exist'
    );
  });

  it("should throw an error when any object is not of the expected type", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id track_1":
          return "track_1";
        case "id scene_1":
          return "scene_1";
      }
    });
    liveApiType.mockImplementation(function () {
      if (this._id === "track_1") return "Track";
      if (this._id === "scene_1") return "Scene";
    });

    expect(() => deleteObject({ ids: "track_1, scene_1", type: "track" })).toThrow(
      'delete failed: id "scene_1" is not a track (type=Scene)'
    );
  });

  it("should handle whitespace in comma-separated IDs", () => {
    const ids = " track_0 , track_1 ";
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0":
          return "track_0";
        case "live_set tracks 1":
          return "track_1";
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "track_0":
          return "live_set tracks 0";
        case "track_1":
          return "live_set tracks 1";
      }
    });
    liveApiType.mockImplementation(function () {
      if (["track_0", "track_1"].includes(this._id)) return "Track";
    });

    const result = deleteObject({ ids, type: "track" });

    expect(result).toEqual([
      { id: "track_1", type: "track", deleted: true },
      { id: "track_0", type: "track", deleted: true },
    ]);
  });

  it("should return single object for single ID and array for multiple IDs", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0":
          return "track_0";
        case "live_set tracks 1":
          return "track_1";
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "track_0":
          return "live_set tracks 0";
        case "track_1":
          return "live_set tracks 1";
      }
    });
    liveApiType.mockImplementation(function () {
      if (["track_0", "track_1"].includes(this._id)) return "Track";
    });

    const singleResult = deleteObject({ ids: "track_0", type: "track" });
    const arrayResult = deleteObject({ ids: "track_0, track_1", type: "track" });

    expect(singleResult).toEqual({ id: "track_0", type: "track", deleted: true });
    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
  });
});
