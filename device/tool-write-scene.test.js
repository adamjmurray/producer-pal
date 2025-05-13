// device/tool-write-scene.test.js
import { describe, expect, it, vi } from "vitest";
import { liveApiCall, liveApiId, liveApiSet } from "./mock-live-api";
import { writeScene } from "./tool-write-scene";

// Mock readScene since it's used in writeScene
vi.mock("./tool-read-scene", () => ({
  readScene: vi.fn().mockReturnValue({
    id: "scene1",
    name: "Test Scene",
    sceneIndex: 0,
  }),
}));

describe("writeScene", () => {
  beforeEach(() => {
    liveApiId.mockReturnValue("scene1");
  });

  it("should throw an error when scene does not exist", async () => {
    liveApiId.mockReturnValue("id 0");

    await expect(() => writeScene({ sceneIndex: 99 })).rejects.toThrow("Scene index 99 does not exist");
  });

  it("should update all properties when provided", async () => {
    const result = await writeScene({
      sceneIndex: 0,
      name: "New Scene Name",
      color: "#FF0000",
      tempo: 120,
      isTempoEnabled: true,
      timeSignature: "3/4",
      isTimeSignatureEnabled: true,
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

  it("should not update properties when not provided", async () => {
    const result = await writeScene({
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

  it("should fire scene when isTriggered is true", async () => {
    const result = await writeScene({
      sceneIndex: 0,
      trigger: true,
    });

    expect(liveApiCall).toHaveBeenCalledWith("fire");
    expect(result.id).toBe("scene1");
  });

  it("should throw error for invalid time signature format", async () => {
    await expect(() => writeScene({ sceneIndex: 0, timeSignature: "invalid" })).rejects.toThrow(
      "Time signature must be in format"
    );
    await expect(() => writeScene({ sceneIndex: 0, timeSignature: "3-4" })).rejects.toThrow(
      "Time signature must be in format"
    );
  });

  it("should handle multiple property updates", async () => {
    const result = await writeScene({
      sceneIndex: 1,
      name: "Multi Update",
      color: "#00FF00",
      tempo: 140,
      isTempoEnabled: false,
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Multi Update");
    expect(liveApiSet).toHaveBeenCalledWith("color", 65280);
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 140);
    expect(liveApiSet).toHaveBeenCalledWith("tempo_enabled", false);
  });

  it("should handle boolean false values correctly", async () => {
    const result = await writeScene({
      sceneIndex: 0,
      isTempoEnabled: false,
      isTimeSignatureEnabled: false,
    });

    expect(liveApiSet).toHaveBeenCalledWith("tempo_enabled", false);
    expect(liveApiSet).toHaveBeenCalledWith("time_signature_enabled", false);
  });

  it("should work with no arguments except sceneIndex", async () => {
    const result = await writeScene({
      sceneIndex: 0,
    });

    expect(liveApiSet).not.toHaveBeenCalled();
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result.id).toBe("scene1");
  });
});
