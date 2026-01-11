import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
  MockSequence,
} from "#src/test/mock-live-api.js";
import { MAX_AUTO_CREATED_SCENES } from "#src/tools/constants.js";
import { createClip } from "./create-clip.js";

describe("createClip - session view", () => {
  it("should create a single clip with notes", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip_0_0";
        default:
          return this._id;
      }
    });
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
      Clip: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C3 D3 E3 1|1",
      name: "New Clip",
      color: "#FF0000",
      looping: true,
      auto: "play-clip",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4,
    ); // Length based on notes (1 bar in 4/4)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: "live_set tracks 0 clip_slots 0 clip",
      }),
      "name",
      "New Clip",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: "live_set tracks 0 clip_slots 0 clip",
      }),
      "color",
      16711680,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: "live_set tracks 0 clip_slots 0 clip",
      }),
      "looping",
      1, // Live API uses 1 for true
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: "live_set tracks 0 clip_slots 0 clip",
      }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 62,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 64,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ],
      },
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "fire",
    );

    expect(result).toStrictEqual({
      id: "clip_0_0",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 3,
      length: "1:0",
    });
  });

  it("should fire the scene when auto=play-scene", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
      Clip: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "C3 1|1",
      auto: "play-scene",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set scenes 0" }),
      "fire",
    );
    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 1,
      length: "1:0",
    });
  });

  it("should throw error when scene does not exist for auto=play-scene", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
      Clip: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    // Mock scene to not exist
    const originalExists = global.LiveAPI.prototype.exists;

    global.LiveAPI.prototype.exists = vi.fn(function () {
      // Scene does not exist
      return !this._path?.startsWith("live_set scenes");
    });

    expect(() =>
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        notes: "C3 1|1",
        auto: "play-scene",
      }),
    ).toThrow(
      'createClip auto="play-scene" failed: scene at sceneIndex=0 does not exist',
    );

    global.LiveAPI.prototype.exists = originalExists;
  });

  it("should throw error for invalid auto value", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
      Clip: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    expect(() =>
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        auto: "invalid-value",
      }),
    ).toThrow('createClip failed: unknown auto value "invalid-value"');
  });

  it("should create multiple clips at specified scene indices", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0 clip_slots 1 clip":
          return "clip_0_1";
        case "live_set tracks 0 clip_slots 2 clip":
          return "clip_0_2";
        case "live_set tracks 0 clip_slots 3 clip":
          return "clip_0_3";
        default:
          return this._id;
      }
    });
    mockLiveApiGet({
      LiveSet: {
        scenes: children("scene0"), // Only 1 existing scene, so we need to create scenes 1, 2, 3
        signature_numerator: 4,
      },
      ClipSlot: { has_clip: 0 },
    });

    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "1,2,3", // Create clips at scenes 1, 2, and 3
      name: "Loop",
      color: "#00FF00",
    });

    // Should create 3 scenes first (for slots 1, 2, 3), then 3 clips
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      -1,
    ); // scene for slot 1
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      -1,
    ); // scene for slot 2
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "create_scene",
      -1,
    ); // scene for slot 3
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 1" }),
      "create_clip",
      4,
    ); // clip in slot 1 (1 bar in 4/4)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 2" }),
      "create_clip",
      4,
    ); // clip in slot 2 (1 bar in 4/4)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 3" }),
      "create_clip",
      4,
    ); // clip in slot 3 (1 bar in 4/4)

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: "live_set tracks 0 clip_slots 1 clip",
      }),
      "name",
      "Loop",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: "live_set tracks 0 clip_slots 2 clip",
      }),
      "name",
      "Loop 2",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({
        path: "live_set tracks 0 clip_slots 3 clip",
      }),
      "name",
      "Loop 3",
    );

    expect(result).toStrictEqual([
      { id: "clip_0_1", trackIndex: 0, sceneIndex: 1 },
      { id: "clip_0_2", trackIndex: 0, sceneIndex: 2 },
      { id: "clip_0_3", trackIndex: 0, sceneIndex: 3 },
    ]);
  });

  it("should auto-create scenes when sceneIndex exceeds existing scenes", () => {
    mockLiveApiGet({
      LiveSet: {
        scenes: children("scene1", "scene2"), // 2 existing scenes
        signature_numerator: 4,
      },
      ClipSlot: { has_clip: new MockSequence(0, 1) },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "4", // Needs scenes at indices 2, 3, 4
      name: "Future Clip",
    });

    // Should create 3 padding scenes (indices 2,3,4)
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
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 4" }),
      "create_clip",
      4,
    ); // 1 bar in 4/4
  });

  it("should emit warning and return empty array if clip already exists", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 1 },
      LiveSet: { signature_numerator: 4 },
    });

    // Runtime errors during clip creation are now warnings, not fatal errors
    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      name: "This Should Fail",
    });

    // Should return empty array (no clips created)
    expect(result).toStrictEqual([]);
  });

  it("should emit warning and return empty array if sceneIndex exceeds maximum", () => {
    mockLiveApiGet({
      LiveSet: { signature_numerator: 4 },
    });

    // Runtime errors during clip creation are now warnings, not fatal errors
    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: String(MAX_AUTO_CREATED_SCENES),
      name: "This Should Fail",
    });

    // Should return empty array (no clips created)
    expect(result).toStrictEqual([]);
  });
});
