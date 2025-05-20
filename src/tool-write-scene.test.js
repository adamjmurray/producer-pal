// src/tool-write-scene.test.js
import { describe, expect, it } from "vitest";
import { children, liveApiCall, liveApiId, liveApiSet, mockLiveApiGet } from "./mock-live-api";
import { MAX_AUTO_CREATED_SCENES } from "./tool-write-clip";
import { writeScene } from "./tool-write-scene";

describe("writeScene", () => {
  beforeEach(() => {
    liveApiId.mockReturnValue("scene1");
  });

  it("should update all properties when provided", () => {
    const result = writeScene({
      sceneIndex: 0,
      name: "New Scene Name",
      color: "#FF0000",
      tempo: 120,
      timeSignature: "3/4",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "New Scene Name");
    expect(liveApiSet).toHaveBeenCalledWith("color", 16711680);
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 120);
    expect(liveApiSet).toHaveBeenCalledWith("tempo_enabled", true);
    expect(liveApiSet).toHaveBeenCalledWith("time_signature_numerator", 3);
    expect(liveApiSet).toHaveBeenCalledWith("time_signature_denominator", 4);
    expect(liveApiSet).toHaveBeenCalledWith("time_signature_enabled", true);
    expect(result.id).toBe("scene1");
  });

  it("should not update properties when not provided", () => {
    const result = writeScene({
      sceneIndex: 1,
      name: "Only Name Update",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Only Name Update");
    expect(liveApiSet).not.toHaveBeenCalledWith("color", expect.any(Number));
    expect(liveApiSet).not.toHaveBeenCalledWith("tempo", expect.any(Number));
    expect(liveApiSet).not.toHaveBeenCalledWith("tempo_enabled", expect.any(Boolean));
    expect(liveApiSet).not.toHaveBeenCalledWith("time_signature_numerator", expect.any(Number));
    expect(liveApiSet).not.toHaveBeenCalledWith("time_signature_denominator", expect.any(Number));
    expect(liveApiSet).not.toHaveBeenCalledWith("time_signature_enabled", expect.any(Boolean));
  });

  it("should throw error for invalid time signature format", () => {
    expect(() => writeScene({ sceneIndex: 0, timeSignature: "invalid" })).toThrow("Time signature must be in format");
    expect(() => writeScene({ sceneIndex: 0, timeSignature: "3-4" })).toThrow("Time signature must be in format");
  });

  it("should handle multiple property updates", () => {
    const result = writeScene({
      sceneIndex: 1,
      name: "Multi Update",
      color: "#00FF00",
      tempo: 140,
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Multi Update");
    expect(liveApiSet).toHaveBeenCalledWith("color", 65280);
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 140);
    expect(liveApiSet).toHaveBeenCalledWith("tempo_enabled", true);
  });

  it("should work with no arguments except sceneIndex", () => {
    const result = writeScene({
      sceneIndex: 0,
    });

    expect(liveApiSet).not.toHaveBeenCalled();
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result.id).toBe("scene1");
  });

  it("auto-creates scenes when sceneIndex exceeds existing scenes", () => {
    mockLiveApiGet({
      LiveSet: { scenes: children("scene1", "scene2", "scene3") },
    });

    writeScene({
      sceneIndex: 5,
      name: "Auto-created scene",
    });

    const createSceneCalls = liveApiCall.mock.calls.filter(
      ([liveApiFunction, ..._args]) => liveApiFunction === "create_scene"
    );
    expect(createSceneCalls.length).toBe(3);
    createSceneCalls.forEach((createSceneCall, callIndex) => {
      expect(liveApiCall.mock.instances[callIndex].path).toBe("live_set");
      expect(createSceneCall).toEqual(["create_scene", -1]);
    });
  });

  it("should disable tempo when -1 is passed", () => {
    const result = writeScene({
      sceneIndex: 0,
      tempo: -1,
    });

    expect(liveApiSet).toHaveBeenCalledWith("tempo_enabled", false);
    expect(liveApiSet).not.toHaveBeenCalledWith("tempo", expect.any(Number));
  });

  it("should disable time signature when the string 'disabled' is passed", () => {
    const result = writeScene({
      sceneIndex: 0,
      timeSignature: "disabled",
    });

    expect(liveApiSet).toHaveBeenCalledWith("time_signature_enabled", false);
    expect(liveApiSet).not.toHaveBeenCalledWith("time_signature_numerator", expect.any(Number));
    expect(liveApiSet).not.toHaveBeenCalledWith("time_signature_denominator", expect.any(Number));
  });

  it("throws an error if sceneIndex exceeds maximum allowed scenes", () => {
    expect(() =>
      writeScene({
        sceneIndex: MAX_AUTO_CREATED_SCENES,
        name: "This Should Fail",
      })
    ).toThrow(/exceeds the maximum allowed value/);

    expect(liveApiCall).not.toHaveBeenCalledWith("create_scene", expect.any(Number));
  });
});
