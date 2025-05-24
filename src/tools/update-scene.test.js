// src/tools/update-scene.test.js
import { describe, expect, it } from "vitest";
import { liveApiId, liveApiPath, liveApiSet } from "../mock-live-api";
import { updateScene } from "./update-scene";

describe("updateScene", () => {
  beforeEach(() => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id scene1":
          return "scene1";
        case "id scene2":
          return "scene2";
        case "id scene3":
          return "scene3";
        default:
          return "id 0";
      }
    });

    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "scene1":
          return "live_set scenes 0";
        case "scene2":
          return "live_set scenes 1";
        case "scene3":
          return "live_set scenes 2";
        default:
          return "";
      }
    });
  });

  it("should update a single scene by ID", () => {
    const result = updateScene({
      ids: "scene1",
      name: "Updated Scene",
      color: "#FF0000",
      tempo: 140,
      timeSignature: "3/4",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Updated Scene");
    expect(liveApiSet).toHaveBeenCalledWith("color", 16711680);
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 140);
    expect(liveApiSet).toHaveBeenCalledWith("tempo_enabled", true);
    expect(liveApiSet).toHaveBeenCalledWith("time_signature_numerator", 3);
    expect(liveApiSet).toHaveBeenCalledWith("time_signature_denominator", 4);
    expect(liveApiSet).toHaveBeenCalledWith("time_signature_enabled", true);
    expect(result).toEqual({
      id: "scene1",
      sceneIndex: 0,
      name: "Updated Scene",
      color: "#FF0000",
      tempo: 140,
      timeSignature: "3/4",
    });
  });

  it("should update multiple scenes by comma-separated IDs", () => {
    const result = updateScene({
      ids: "scene1, scene2",
      color: "#00FF00",
      tempo: 120,
    });

    expect(liveApiSet).toHaveBeenCalledWith("color", 65280);
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 120);
    expect(liveApiSet).toHaveBeenCalledWith("tempo_enabled", true);
    expect(liveApiSet).toHaveBeenCalledTimes(6); // 3 calls per scene

    expect(result).toEqual([
      {
        id: "scene1",
        sceneIndex: 0,
        color: "#00FF00",
        tempo: 120,
      },
      {
        id: "scene2",
        sceneIndex: 1,
        color: "#00FF00",
        tempo: 120,
      },
    ]);
  });

  it("should handle 'id ' prefixed scene IDs", () => {
    const result = updateScene({
      ids: "id scene1",
      name: "Prefixed ID Scene",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Prefixed ID Scene");
    expect(result).toEqual({
      id: "scene1",
      sceneIndex: 0,
      name: "Prefixed ID Scene",
    });
  });

  it("should not update properties when not provided", () => {
    const result = updateScene({
      ids: "scene1",
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Only Name Update");
    expect(liveApiSet).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "scene1",
      sceneIndex: 0,
      name: "Only Name Update",
    });
  });

  it("should disable tempo when -1 is passed", () => {
    const result = updateScene({
      ids: "scene1",
      tempo: -1,
    });

    expect(liveApiSet).toHaveBeenCalledWith("tempo_enabled", false);
    expect(liveApiSet).not.toHaveBeenCalledWith("tempo", expect.any(Number));
    expect(result).toEqual({
      id: "scene1",
      sceneIndex: 0,
      tempo: "disabled",
    });
  });

  it("should disable time signature when 'disabled' is passed", () => {
    const result = updateScene({
      ids: "scene1",
      timeSignature: "disabled",
    });

    expect(liveApiSet).toHaveBeenCalledWith("time_signature_enabled", false);
    expect(liveApiSet).not.toHaveBeenCalledWith("time_signature_numerator", expect.any(Number));
    expect(liveApiSet).not.toHaveBeenCalledWith("time_signature_denominator", expect.any(Number));
    expect(result).toEqual({
      id: "scene1",
      sceneIndex: 0,
      timeSignature: "disabled",
    });
  });

  it("should throw error when ids is missing", () => {
    expect(() => updateScene({})).toThrow("updateScene failed: ids is required");
    expect(() => updateScene({ name: "Test" })).toThrow("updateScene failed: ids is required");
  });

  it("should throw error when scene ID doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => updateScene({ ids: "nonexistent" })).toThrow(
      'updateScene failed: scene with id "nonexistent" does not exist'
    );
  });

  it("should throw error when any scene ID in comma-separated list doesn't exist", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "id scene1":
          return "scene1";
        case "id nonexistent":
          return "id 0";
        default:
          return "id 0";
      }
    });

    expect(() => updateScene({ ids: "scene1, nonexistent", name: "Test" })).toThrow(
      'updateScene failed: scene with id "nonexistent" does not exist'
    );
  });

  it("should throw error when scene path cannot be parsed", () => {
    liveApiPath.mockImplementation(function () {
      if (this._id === "scene1") return "invalid_path";
      return "";
    });

    expect(() => updateScene({ ids: "scene1", name: "Test" })).toThrow(
      'updateScene failed: could not determine sceneIndex for id "scene1" (path="invalid_path")'
    );
  });

  it("should throw error for invalid time signature format", () => {
    expect(() => updateScene({ ids: "scene1", timeSignature: "invalid" })).toThrow("Time signature must be in format");
    expect(() => updateScene({ ids: "scene1", timeSignature: "3-4" })).toThrow("Time signature must be in format");
  });

  it("should return single object for single ID and array for comma-separated IDs", () => {
    const singleResult = updateScene({ ids: "scene1", name: "Single" });
    const arrayResult = updateScene({ ids: "scene1, scene2", name: "Multiple" });

    expect(singleResult).toEqual({
      id: "scene1",
      sceneIndex: 0,
      name: "Single",
    });
    expect(arrayResult).toEqual([
      {
        id: "scene1",
        sceneIndex: 0,
        name: "Multiple",
      },
      {
        id: "scene2",
        sceneIndex: 1,
        name: "Multiple",
      },
    ]);
  });

  it("should handle whitespace in comma-separated IDs", () => {
    const result = updateScene({
      ids: " scene1 , scene2 , scene3 ",
      color: "#0000FF",
    });

    expect(result).toEqual([
      {
        id: "scene1",
        sceneIndex: 0,
        color: "#0000FF",
      },
      {
        id: "scene2",
        sceneIndex: 1,
        color: "#0000FF",
      },
      {
        id: "scene3",
        sceneIndex: 2,
        color: "#0000FF",
      },
    ]);
  });

  it("should filter out empty IDs from comma-separated list", () => {
    const result = updateScene({
      ids: "scene1,,scene2,  ,scene3",
      name: "Filtered",
    });

    expect(liveApiSet).toHaveBeenCalledTimes(3); // Only 3 valid IDs
    expect(result).toEqual([
      {
        id: "scene1",
        sceneIndex: 0,
        name: "Filtered",
      },
      {
        id: "scene2",
        sceneIndex: 1,
        name: "Filtered",
      },
      {
        id: "scene3",
        sceneIndex: 2,
        name: "Filtered",
      },
    ]);
  });
});
