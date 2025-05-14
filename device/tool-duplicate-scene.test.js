// device/tool-duplicate-scene.test.js
import { describe, expect, it } from "vitest";
import { expectedScene, liveApiCall, liveApiId, liveApiSet, mockLiveApiGet } from "./mock-live-api";
import { duplicateScene } from "./tool-duplicate-scene";

describe("duplicateScene", () => {
  it("should duplicate the scene at the specified index", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set scenes 1") return "duplicated_scene";
    });
    mockLiveApiGet({
      "live_set scenes 1": {
        name: "Duplicated Scene",
      },
    });

    const result = duplicateScene({ sceneIndex: 0 });

    expect(liveApiCall).toHaveBeenCalledWith("duplicate_scene", 0);
    expect(result).toEqual(
      expectedScene({
        id: "duplicated_scene",
        name: "Duplicated Scene",
        sceneIndex: 1,
      })
    );
  });

  it("should set the scene name when provided", () => {
    duplicateScene({ sceneIndex: 0, name: "Custom Scene Name" });

    expect(liveApiCall).toHaveBeenCalledWith("duplicate_scene", 0);

    expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Scene Name");
    expect(liveApiSet.mock.instances[0].path).toBe("live_set scenes 1");
  });

  it("should throw an error when sceneIndex is not provided", () => {
    expect(() => duplicateScene({})).toThrow("duplicate-scene failed: sceneIndex is required");
    expect(() => duplicateScene()).toThrow("duplicate-scene failed: sceneIndex is required");
  });
});
