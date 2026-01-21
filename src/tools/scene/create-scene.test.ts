import { beforeEach, describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.ts";
import { createScene } from "./create-scene.ts";

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
    expect(result).toStrictEqual({ id: "scene1", sceneIndex: 1 });
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

    expect(result).toStrictEqual([
      { id: "scene1", sceneIndex: 0 },
      { id: "scene1", sceneIndex: 1 },
      { id: "scene1", sceneIndex: 2 },
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
    expect(result).toStrictEqual({ id: "scene1", sceneIndex: 0 });
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

    expect(singleResult).toStrictEqual({ id: "scene1", sceneIndex: 0 });

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    const arrayResultArr = arrayResult as Array<{
      id: string;
      sceneIndex: number;
    }>;

    expect(arrayResultArr[0]).toStrictEqual({ id: "scene1", sceneIndex: 1 });
    expect(arrayResultArr[1]).toStrictEqual({ id: "scene1", sceneIndex: 2 });
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
    expect(result).toStrictEqual({ id: "scene1", sceneIndex: 0 });
  });

  it("should include disabled tempo and timeSignature in result", () => {
    const result = createScene({
      sceneIndex: 0,
      tempo: -1,
      timeSignature: "disabled",
    });

    expect(result).toStrictEqual({ id: "scene1", sceneIndex: 0 });
  });

  describe("capture mode", () => {
    beforeEach(() => {
      // Reset liveApiId to use default path-based ID generation for capture tests
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        return this._id;
      });
      liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "live_set view selected_scene") {
          return "live_set scenes 1";
        }

        return this._path;
      });
      mockLiveApiGet({
        "live_set scenes 2": { name: "Captured Scene" },
        LiveSet: { tracks: [] }, // No tracks means no clips
      });
    });

    it("should delegate to captureScene when capture=true", () => {
      const result = createScene({ capture: true });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "capture_and_insert_scene",
      );

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should delegate to captureScene with sceneIndex and name", () => {
      const result = createScene({
        capture: true,
        sceneIndex: 1,
        name: "Custom Capture",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set view" }),
        "selected_scene",
        "id live_set/scenes/1",
      );

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set scenes 2" }),
        "name",
        "Custom Capture",
      );

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should apply additional properties after capture", () => {
      const result = createScene({
        capture: true,
        name: "Captured with Props",
        color: "#FF0000",
        tempo: 140,
        timeSignature: "3/4",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "live_set/scenes/2" }),
        "color",
        16711680,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "live_set/scenes/2" }),
        "tempo",
        140,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "live_set/scenes/2" }),
        "tempo_enabled",
        true,
      );

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should handle disabled tempo and timeSignature in capture mode", () => {
      const result = createScene({
        capture: true,
        tempo: -1,
        timeSignature: "disabled",
      });

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "live_set/scenes/2" }),
        "tempo_enabled",
        false,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "live_set/scenes/2" }),
        "time_signature_enabled",
        false,
      );

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should return clips when capturing with existing clips", () => {
      liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
        // Mock clips at track 0 and 2 to exist, track 1 to not exist (id 0)
        if (this._path === "live_set tracks 1 clip_slots 2 clip") {
          return "0";
        }

        return this._id;
      });
      mockLiveApiGet({
        "live_set scenes 2": { name: "Captured Scene" },
        LiveSet: {
          tracks: ["id", "1", "id", "2", "id", "3"],
        },
      });

      const result = createScene({
        capture: true,
        name: "With Clips",
      });

      expect(result).toStrictEqual({
        id: "live_set/scenes/2",
        sceneIndex: 2,
        clips: [
          { id: "live_set/tracks/0/clip_slots/2/clip", trackIndex: 0 },
          { id: "live_set/tracks/2/clip_slots/2/clip", trackIndex: 2 },
        ],
      });
    });
  });

  describe("switchView functionality", () => {
    it("should switch to session view when creating scenes with switchView=true", () => {
      const result = createScene({
        sceneIndex: 0,
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(result).toStrictEqual({
        id: "scene1",
        sceneIndex: 0,
      });
    });

    it("should switch to session view when capturing scenes with switchView=true", () => {
      // Mock the selected scene path for capture functionality
      liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._path === "live_set view selected_scene") {
          return "live_set scenes 1";
        }

        return this._path;
      });
      mockLiveApiGet({
        "live_set scenes 2": { name: "Captured Scene" },
        LiveSet: { tracks: [] }, // No tracks means no clips
      });

      const result = createScene({
        capture: true,
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(result).toStrictEqual({
        id: "scene1",
        sceneIndex: 2,
        clips: [],
      });
    });

    it("should not switch views when switchView=false", () => {
      createScene({
        sceneIndex: 0,
        switchView: false,
      });

      expect(liveApiCall).not.toHaveBeenCalledWith(
        "show_view",
        expect.anything(),
      );
    });

    it("should work with multiple scenes when switchView=true", () => {
      const result = createScene({
        sceneIndex: 0,
        count: 3,
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
    });
  });
});
