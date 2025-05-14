// device/tool-delete-scene.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiType } from "./mock-live-api";
import { deleteScene } from "./tool-delete-scene";

describe("deleteScene", () => {
  it("should delete a scene when it exists", () => {
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

    const result = deleteScene({ id });

    expect(result).toEqual({ id, deleted: true });
    expect(liveApiCall).toHaveBeenNthCalledWith(1, "delete_scene", sceneIndex);
    expect(liveApiCall.mock.instances[0].path).toBe("live_set");
  });

  it("should throw an error when id arg is missing", () => {
    const expectedError = "delete-scene failed: id is required";
    expect(() => deleteScene()).toThrow(expectedError);
    expect(() => deleteScene({})).toThrow(expectedError);
    expect(() => deleteScene({ ID: "scene_1" })).toThrow(expectedError);
  });

  it("should throw an error when no scene exists", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => deleteScene({ id: "scene_1" })).toThrow('delete-scene failed: id "scene_1" does not exist');
  });

  it("should throw an error when the id exists but is not a scene id", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "track_1") return "Track";
    });
    expect(() => deleteScene({ id: "track_1" })).toThrow(
      'delete-scene failed: id "track_1" was not a scene (type=Track)'
    );
  });

  it("should throw an error when the scene's path doesn't contain a scene index", () => {
    liveApiType.mockImplementation(function () {
      if (this._id === "scene_1") return "Scene";
    });
    expect(() => deleteScene({ id: "scene_1" })).toThrow(
      'delete-scene failed: no scene index for id "scene_1" (path="id scene_1")'
    );
  });
});
