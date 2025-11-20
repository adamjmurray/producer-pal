import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "../../test/mock-live-api.js";
import { deleteObject } from "./delete.js";

describe("deleteObject", () => {
  it("should delete a single track when type is 'track'", () => {
    const id = "track_2";
    const trackIndex = 1;
    const path = `live_set tracks ${trackIndex}`;
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case path:
          return id;
        default:
          return this._id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case id:
          return path;
        default:
          return this._path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (this._id === id) {
        return "Track";
      }
    });

    const result = deleteObject({ ids: id, type: "track" });

    expect(result).toEqual({ id, type: "track", deleted: true });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "delete_track",
      trackIndex,
    );
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
        default:
          return this._id;
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
        default:
          return this._path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (["track_0", "track_1", "track_2"].includes(this._id)) {
        return "Track";
      }
    });

    const result = deleteObject({ ids, type: "track" });

    // Should delete in descending order (2, 1, 0) to maintain indices
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      1,
      expect.objectContaining({ path: "live_set" }),
      "delete_track",
      2,
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      2,
      expect.objectContaining({ path: "live_set" }),
      "delete_track",
      1,
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      3,
      expect.objectContaining({ path: "live_set" }),
      "delete_track",
      0,
    );

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
        default:
          return this._id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case id:
          return path;
        default:
          return this._path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (this._id === id) {
        return "Scene";
      }
    });

    const result = deleteObject({ ids: id, type: "scene" });

    expect(result).toEqual({ id, type: "scene", deleted: true });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "delete_scene",
      sceneIndex,
    );
  });

  it("should delete multiple scenes in descending index order", () => {
    const ids = "scene_0, scene_2";
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set scenes 0":
          return "scene_0";
        case "live_set scenes 2":
          return "scene_2";
        default:
          return this._id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "scene_0":
          return "live_set scenes 0";
        case "scene_2":
          return "live_set scenes 2";
        default:
          return this._path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (["scene_0", "scene_2"].includes(this._id)) {
        return "Scene";
      }
    });

    const result = deleteObject({ ids, type: "scene" });

    // Should delete in descending order (2, 0) to maintain indices
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      1,
      expect.objectContaining({ path: "live_set" }),
      "delete_scene",
      2,
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      2,
      expect.objectContaining({ path: "live_set" }),
      "delete_scene",
      0,
    );

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
        default:
          return this._id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "clip_0_0":
          return "live_set tracks 0 clip_slots 0 clip";
        case "clip_1_1":
          return "live_set tracks 1 clip_slots 1 clip";
        default:
          return this._path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (["clip_0_0", "clip_1_1"].includes(this._id)) {
        return "Clip";
      }
    });

    const result = deleteObject({ ids, type: "clip" });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "delete_clip",
      "id clip_0_0",
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 1" }),
      "delete_clip",
      "id clip_1_1",
    );

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
    const expectedError =
      'delete failed: type must be one of "track", "scene", or "clip"';
    expect(() => deleteObject({ ids: "clip_1", type: "invalid" })).toThrow(
      expectedError,
    );
  });

  it("should log warning when object doesn't exist", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id 123":
          return "123";
        case "id 999":
          return "id 0";
        default:
          return this._id;
      }
    });
    liveApiType.mockImplementation(function () {
      if (this._id === "123") {
        return "Track";
      }
    });

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = deleteObject({ ids: "999", type: "track" });

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'delete: id "999" does not exist',
    );
  });

  it("should log warning when object is wrong type", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id track_1":
          return "track_1";
        case "id scene_1":
          return "scene_1";
        default:
          return this._id;
      }
    });
    liveApiType.mockImplementation(function () {
      if (this._id === "track_1") {
        return "Track";
      }
      if (this._id === "scene_1") {
        return "Scene";
      }
    });

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = deleteObject({ ids: "scene_1", type: "track" });

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'delete: id "scene_1" is not a track (found Scene)',
    );
  });

  it("should skip invalid IDs in comma-separated list and delete valid ones", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0":
          return "track_0";
        case "live_set tracks 2":
          return "track_2";
        case "id track_0":
          return "track_0";
        case "nonexistent": // LiveAPI.from("nonexistent") creates path="nonexistent"
          return "id 0"; // non-existent
        case "id track_2":
          return "track_2";
        default:
          return this._id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "track_0":
          return "live_set tracks 0";
        case "track_2":
          return "live_set tracks 2";
        default:
          return this._path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (["track_0", "track_2"].includes(this._id)) {
        return "Track";
      }
    });

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = deleteObject({
      ids: "track_0, nonexistent, track_2",
      type: "track",
    });

    // Should delete valid tracks in descending order (track_2, then track_0)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "delete_track",
      2,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "delete_track",
      0,
    );

    expect(result).toEqual([
      { id: "track_2", type: "track", deleted: true },
      { id: "track_0", type: "track", deleted: true },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'delete: id "nonexistent" does not exist',
    );
  });

  it("should return empty array when all IDs are invalid", () => {
    liveApiId.mockReturnValue("id 0"); // All non-existent

    const consoleErrorSpy = vi.spyOn(console, "error");

    const result = deleteObject({
      ids: "nonexistent1, nonexistent2",
      type: "track",
    });

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'delete: id "nonexistent1" does not exist',
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'delete: id "nonexistent2" does not exist',
    );
  });

  it("should throw error when trying to delete Producer Pal host track", () => {
    liveApiPath.mockImplementation(function () {
      if (this._path === "this_device") {
        return "live_set tracks 1 devices 0";
      }
      if (this._id === "track_1") {
        return "live_set tracks 1";
      }
      return this._path;
    });
    expect(() => deleteObject({ ids: "track_1", type: "track" })).toThrow(
      "cannot delete track hosting the Producer Pal device",
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
        default:
          return this._id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "track_0":
          return "live_set tracks 0";
        case "track_1":
          return "live_set tracks 1";
        default:
          return this._path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (["track_0", "track_1"].includes(this._id)) {
        return "Track";
      }
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
        default:
          return this._id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "track_0":
          return "live_set tracks 0";
        case "track_1":
          return "live_set tracks 1";
        default:
          return this._path;
      }
    });
    liveApiType.mockImplementation(function () {
      if (["track_0", "track_1"].includes(this._id)) {
        return "Track";
      }
    });

    const singleResult = deleteObject({ ids: "track_0", type: "track" });
    const arrayResult = deleteObject({
      ids: "track_0, track_1",
      type: "track",
    });

    expect(singleResult).toEqual({
      id: "track_0",
      type: "track",
      deleted: true,
    });
    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
  });

  it("should throw error when track path is malformed (no track index)", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 0") {
        return "track_0";
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === "track_0") {
        return "invalid_path_without_track_index";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === "track_0") {
        return "Track";
      }
    });

    expect(() => deleteObject({ ids: "track_0", type: "track" })).toThrow(
      'delete failed: no track index for id "track_0" (path="invalid_path_without_track_index")',
    );
  });

  it("should throw error when scene path is malformed (no scene index)", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set scenes 0") {
        return "scene_0";
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === "scene_0") {
        return "invalid_path_without_scene_index";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === "scene_0") {
        return "Scene";
      }
    });

    expect(() => deleteObject({ ids: "scene_0", type: "scene" })).toThrow(
      'delete failed: no scene index for id "scene_0" (path="invalid_path_without_scene_index")',
    );
  });

  it("should throw error when clip path is malformed (no track index)", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 0 clip_slots 0 clip") {
        return "clip_0";
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip_0") {
        return "invalid_path_without_track_index";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === "clip_0") {
        return "Clip";
      }
    });

    expect(() => deleteObject({ ids: "clip_0", type: "clip" })).toThrow(
      'delete failed: no track index for id "clip_0" (path="invalid_path_without_track_index")',
    );
  });
});
