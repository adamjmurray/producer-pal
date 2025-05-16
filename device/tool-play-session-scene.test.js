// device/tool-play-session-scene.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId } from "./mock-live-api";
import { playSessionScene } from "./tool-play-session-scene";

describe("playSessionScene", () => {
  it("should trigger a scene when it exists", () => {
    const result = playSessionScene({ sceneIndex: 1 });

    expect(liveApiCall).toHaveBeenNthCalledWith(1, "show_view", "Session");
    expect(liveApiCall.mock.instances[0].path).toBe("live_app view");

    expect(liveApiCall).toHaveBeenNthCalledWith(2, "fire");
    expect(liveApiCall.mock.instances[1].path).toBe("live_set scenes 1");

    expect(result).toEqual({
      message: "Scene at sceneIndex=1 has been triggered",
    });
  });

  it("should throw an error when the scene doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => playSessionScene({ sceneIndex: 99 })).toThrow(
      "play-session-scene failed: scene at sceneIndex=99 does not exist"
    );
  });

  it("should throw an error when sceneIndex is missing", () => {
    expect(() => playSessionScene({})).toThrow("play-session-scene failed: sceneIndex is required");
  });
});
