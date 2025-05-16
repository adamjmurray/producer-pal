// device/tool-delete.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiType } from "./mock-live-api";
import { deleteObject } from "./tool-delete";

describe("deleteObject", () => {
  it("should delete a track when type is 'track'", () => {
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

    const result = deleteObject({ id, type: "track" });

    expect(result).toEqual({ id, type: "track", deleted: true });
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_track", trackIndex);
    expect(liveApiCall.mock.instances[0].path).toBe("live_set");
  });

  it("should delete a scene when type is 'scene'", () => {
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

    const result = deleteObject({ id, type: "scene" });

    expect(result).toEqual({ id, type: "scene", deleted: true });
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_scene", sceneIndex);
    expect(liveApiCall.mock.instances[0].path).toBe("live_set");
  });

  it("should delete a clip when type is 'clip'", () => {
    const id = "clip_0_0";
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0 clip_slots 0 clip":
          return id;
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case id:
          return "live_set tracks 0 clip_slots 0 clip";
      }
    });
    liveApiType.mockImplementation(function () {
      if (this._id === id) return "Clip";
    });

    const result = deleteObject({ id, type: "clip" });

    expect(result).toEqual({ id, type: "clip", deleted: true });
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_clip", `id ${id}`);
    expect(liveApiCall.mock.instances[0].path).toBe("live_set tracks 0");
  });

  it("should throw an error when id arg is missing", () => {
    const expectedError = "delete failed: id is required";
    expect(() => deleteObject()).toThrow(expectedError);
    expect(() => deleteObject({})).toThrow(expectedError);
    expect(() => deleteObject({ type: "clip" })).toThrow(expectedError);
  });

  it("should throw an error when type arg is missing", () => {
    const expectedError = "delete failed: type is required";
    expect(() => deleteObject({ id: "clip_1" })).toThrow(expectedError);
  });

  it("should throw an error when type arg is invalid", () => {
    const expectedError = 'delete failed: type must be one of "track", "scene", or "clip"';
    expect(() => deleteObject({ id: "clip_1", type: "invalid" })).toThrow(expectedError);
  });

  it("should throw an error when no object exists", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => deleteObject({ id: "nonexistent", type: "clip" })).toThrow(
      'delete failed: id "nonexistent" does not exist'
    );
  });

  it("should throw an error when the id exists but is not of the expected type", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "track_1") return "Track";
    });
    expect(() => deleteObject({ id: "track_1", type: "clip" })).toThrow(
      'delete failed: id "track_1" is not a clip (type=Track)'
    );
  });

  it("should throw an error when the track's path doesn't contain a track index", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "track_1") return "Track";
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === "track_1") return "invalid_path";
    });
    expect(() => deleteObject({ id: "track_1", type: "track" })).toThrow(
      'delete failed: no track index for id "track_1" (path="invalid_path")'
    );
  });

  it("should throw an error when the scene's path doesn't contain a scene index", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "scene_1") return "Scene";
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === "scene_1") return "invalid_path";
    });
    expect(() => deleteObject({ id: "scene_1", type: "scene" })).toThrow(
      'delete failed: no scene index for id "scene_1" (path="invalid_path")'
    );
  });

  it("should throw an error when the clip's path doesn't contain a track index", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "clip_1") return "Clip";
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === "clip_1") return "invalid_path";
    });
    expect(() => deleteObject({ id: "clip_1", type: "clip" })).toThrow(
      'delete failed: no track index for id "clip_1" (path="invalid_path")'
    );
  });
});
