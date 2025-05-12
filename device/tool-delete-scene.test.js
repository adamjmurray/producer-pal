// device/tool-delete-scene.test.js
import { describe, expect, it } from "vitest";
import { children, liveApiCall, mockLiveApiGet } from "./mock-live-api";
import { deleteScene } from "./tool-delete-scene";

describe("deleteScene", () => {
  it("should delete a scene when it exists", () => {
    mockLiveApiGet({
      LiveSet: { scenes: children("scene1", "scene2", "scene3") },
      scene2: { name: "Scene 2" },
    });

    const result = deleteScene({ sceneIndex: 1 });

    expect(result.success).toBe(true);
    expect(result.sceneIndex).toBe(1);
    expect(result.message).toContain('Deleted scene "Scene 2"');
    expect(liveApiCall).toHaveBeenCalledWith("delete_scene", 1);
  });

  it("should return an error when scene index is negative", () => {
    mockLiveApiGet({
      LiveSet: { scenes: children("scene1", "scene2") },
    });

    const result = deleteScene({ sceneIndex: -1 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("out of range");
    expect(liveApiCall).not.toHaveBeenCalled();
  });

  it("should return an error when scene index is too high", () => {
    mockLiveApiGet({
      LiveSet: { scenes: children("scene1", "scene2") },
    });

    const result = deleteScene({ sceneIndex: 2 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("out of range");
    expect(result.error).toContain("Valid range: 0-1");
    expect(liveApiCall).not.toHaveBeenCalled();
  });
});
