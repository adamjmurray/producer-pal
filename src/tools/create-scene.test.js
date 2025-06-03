// src/tools/create-scene.test.js
import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
} from "../mock-live-api";
import { MAX_AUTO_CREATED_SCENES } from "./constants";
import { createScene } from "./create-scene";

describe("createScene", () => {
  beforeEach(() => {
    liveApiId.mockReturnValue("scene1");
    mockLiveApiGet({
      LiveSet: { scenes: children("existing1", "existing2") },
    });
  });

  it("should create a single scene at the specified index", () => {
    const result = createScene({
      sceneIndex: 1,
      name: "New Scene",
      color: "#FF0000",
      tempo: 120,
      timeSignature: "3/4",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      1,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "name",
      "New Scene",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "color",
      16711680,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "tempo",
      120,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "tempo_enabled",
      true,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "time_signature_numerator",
      3,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "time_signature_denominator",
      4,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "time_signature_enabled",
      true,
    );
    expect(result).toEqual({
      id: "scene1",
      sceneIndex: 1,
      name: "New Scene",
      color: "#FF0000",
      tempo: 120,
      timeSignature: "3/4",
    });
  });

  it("should create multiple scenes with auto-incrementing names", () => {
    const result = createScene({
      sceneIndex: 0,
      count: 3,
      name: "Verse",
      color: "#00FF00",
    });

    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      1,
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      0,
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      2,
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      1,
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      3,
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      2,
    );

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "name",
      "Verse",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "name",
      "Verse 2",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "name",
      "Verse 3",
    );

    expect(result).toEqual([
      {
        id: "scene1",
        sceneIndex: 0,
        name: "Verse",
        color: "#00FF00",
      },
      {
        id: "scene1",
        sceneIndex: 1,
        name: "Verse 2",
        color: "#00FF00",
      },
      {
        id: "scene1",
        sceneIndex: 2,
        name: "Verse 3",
        color: "#00FF00",
      },
    ]);
  });

  it("should create scenes without setting properties when not provided", () => {
    const result = createScene({ sceneIndex: 0 });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      0,
    );
    expect(liveApiSet).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "scene1",
      sceneIndex: 0,
    });
  });

  it("should pad with empty scenes when sceneIndex exceeds current count", () => {
    mockLiveApiGet({
      LiveSet: { scenes: children("scene1", "scene2") }, // 2 existing scenes
    });

    createScene({
      sceneIndex: 5, // Want to insert at index 5, but only have 2 scenes (indices 0,1)
      name: "Future Scene",
    });

    // Should create 3 padding scenes (indices 2,3,4) then the actual scene at index 5
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      -1,
    ); // padding scene 1
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      -1,
    ); // padding scene 2
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      -1,
    ); // padding scene 3
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      5,
    ); // actual scene

    expect(liveApiCall).toHaveBeenCalledTimes(4);
  });

  it("should disable tempo when -1 is passed", () => {
    createScene({
      sceneIndex: 0,
      tempo: -1,
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "tempo_enabled",
      false,
    );
    expect(liveApiSet).not.toHaveBeenCalledWith("tempo", expect.any(Number));
  });

  it("should disable time signature when 'disabled' is passed", () => {
    createScene({
      sceneIndex: 0,
      timeSignature: "disabled",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "time_signature_enabled",
      false,
    );
    expect(liveApiSet).not.toHaveBeenCalledWith(
      "time_signature_numerator",
      expect.any(Number),
    );
    expect(liveApiSet).not.toHaveBeenCalledWith(
      "time_signature_denominator",
      expect.any(Number),
    );
  });

  it("should throw error when sceneIndex is missing", () => {
    expect(() => createScene({})).toThrow(
      "createScene failed: sceneIndex is required",
    );
    expect(() => createScene({ count: 2 })).toThrow(
      "createScene failed: sceneIndex is required",
    );
  });

  it("should throw error when count is less than 1", () => {
    expect(() => createScene({ sceneIndex: 0, count: 0 })).toThrow(
      "createScene failed: count must be at least 1",
    );
    expect(() => createScene({ sceneIndex: 0, count: -1 })).toThrow(
      "createScene failed: count must be at least 1",
    );
  });

  it("should throw error for invalid time signature format", () => {
    expect(() =>
      createScene({ sceneIndex: 0, timeSignature: "invalid" }),
    ).toThrow("Time signature must be in format");
    expect(() => createScene({ sceneIndex: 0, timeSignature: "3-4" })).toThrow(
      "Time signature must be in format",
    );
  });

  it("should throw error when creating scenes would exceed maximum", () => {
    expect(() =>
      createScene({
        sceneIndex: MAX_AUTO_CREATED_SCENES - 2,
        count: 5,
      }),
    ).toThrow(/would exceed the maximum allowed scenes/);
  });

  it("should return single object for count=1 and array for count>1", () => {
    const singleResult = createScene({
      sceneIndex: 0,
      count: 1,
      name: "Single",
    });
    const arrayResult = createScene({
      sceneIndex: 1,
      count: 2,
      name: "Multiple",
    });

    expect(singleResult).toEqual({
      id: "scene1",
      sceneIndex: 0,
      name: "Single",
    });

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    expect(arrayResult[0].name).toBe("Multiple");
    expect(arrayResult[1].name).toBe("Multiple 2");
  });

  it("should handle single scene name without incrementing", () => {
    const result = createScene({
      sceneIndex: 0,
      count: 1,
      name: "Solo Scene",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "scene1" }),
      "name",
      "Solo Scene",
    );
    expect(result.name).toBe("Solo Scene");
  });

  it("should include disabled tempo and timeSignature in result", () => {
    const result = createScene({
      sceneIndex: 0,
      tempo: -1,
      timeSignature: "disabled",
    });

    expect(result).toEqual({
      id: "scene1",
      sceneIndex: 0,
      tempo: "disabled",
      timeSignature: "disabled",
    });
  });
});
