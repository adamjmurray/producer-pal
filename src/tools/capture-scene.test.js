// src/tools/capture-scene.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiPath, liveApiSet, mockLiveApiGet } from "../mock-live-api";
import { captureScene } from "./capture-scene";

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

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "capture_and_insert_scene",
    );

    expect(result).toEqual({
      id: "live_set/scenes/2",
      sceneIndex: 2,
    });
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

    expect(result).toEqual({
      id: "live_set/scenes/3",
      sceneIndex: 3,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set view" }),
      "selected_scene",
      "id live_set/scenes/2",
    );

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "capture_and_insert_scene",
    );
  });

  it("should set the scene name when provided", () => {
    liveApiPath.mockImplementation(function () {
      if (this._path === "live_set view selected_scene") return "live_set scenes 1";
      return this._path;
    });

    const result = captureScene({ name: "Captured Custom Name" });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "capture_and_insert_scene",
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set scenes 2" }),
      "name",
      "Captured Custom Name",
    );

    expect(result).toEqual({
      id: "live_set/scenes/2",
      sceneIndex: 2,
      name: "Captured Custom Name",
    });
  });

  it("should throw an error when selected scene index can't be determined", () => {
    liveApiPath.mockReturnValue("");
    expect(() => captureScene()).toThrow("capture-scene failed: couldn't determine selected scene index");
  });
});
