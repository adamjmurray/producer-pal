// src/tool-capture-scene.test.js
import { describe, expect, it } from "vitest";
import { expectedScene, liveApiCall, liveApiPath, liveApiSet, mockLiveApiGet } from "./mock-live-api";
import { captureScene } from "./tool-capture-scene";

describe("captureScene", () => {
  it("should capture the currently playing clips", () => {
    liveApiPath.mockImplementation(function () {
      if (this._path === "live_set view selected_scene") {
        return "live_set scenes 1";
      }
      return this._path;
    });
    mockLiveApiGet({
      "live_set scenes 2": { name: "Captured Scene" },
    });

    const result = captureScene();

    expect(liveApiCall).toHaveBeenCalledWith("capture_and_insert_scene");

    expect(result).toEqual(
      expectedScene({
        id: "live_set/scenes/2",
        name: "Captured Scene",
        sceneIndex: 2,
      })
    );
  });

  it("should select a scene before capturing if sceneIndex is provided", () => {
    liveApiPath.mockImplementation(function () {
      if (this._path === "live_set view selected_scene") {
        return "live_set scenes 2";
      }
      return this._path;
    });
    mockLiveApiGet({
      "live_set scenes 3": { name: "Captured Scene after select" },
    });

    const result = captureScene({ sceneIndex: 2 });

    expect(liveApiSet).toHaveBeenCalledWith("selected_scene", "id live_set/scenes/2");
    expect(liveApiSet.mock.instances[0].path).toBe("live_set view");

    expect(liveApiCall).toHaveBeenCalledWith("capture_and_insert_scene");

    expect(result).toEqual(
      expectedScene({
        id: "live_set/scenes/3",
        name: "Captured Scene after select",
        sceneIndex: 3,
      })
    );
  });

  it("should set the scene name when provided", () => {
    liveApiPath.mockImplementation(function () {
      if (this._path === "live_set view selected_scene") return "live_set scenes 1";
      return this._path;
    });

    captureScene({ name: "Captured Custom Name" });

    expect(liveApiCall).toHaveBeenCalledWith("capture_and_insert_scene");

    expect(liveApiSet).toHaveBeenCalledWith("name", "Captured Custom Name");
    expect(liveApiSet.mock.instances[0].path).toBe("live_set scenes 2");
  });

  it("should throw an error when selected scene index can't be determined", () => {
    liveApiPath.mockReturnValue("");
    expect(() => captureScene()).toThrow("capture-scene failed: couldn't determine selected scene index");
  });
});
