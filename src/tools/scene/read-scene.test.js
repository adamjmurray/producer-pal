import { describe, expect, it } from "vitest";
import {
  children,
  expectedClip,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../../test/mock-live-api";
import { readScene } from "./read-scene";

describe("readScene", () => {
  it("returns scene information when a valid scene exists", () => {
    liveApiId.mockReturnValue("scene1");
    mockLiveApiGet({
      LiveSet: {
        tracks: children(),
      },
      Scene: {
        name: "Test Scene",
        color: 16711680, // Red
        is_empty: 0,
        is_triggered: 0,
        tempo: 120,
        tempo_enabled: 1,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        time_signature_enabled: 1,
      },
    });

    const result = readScene({ sceneIndex: 0 });

    expect(result).toEqual({
      id: "scene1",
      name: "Test Scene (1)",
      sceneIndex: 0,
      clipCount: 0,
      tempo: 120,
      timeSignature: "4/4",
    });
  });

  it("returns null values when no scene exists", () => {
    liveApiId.mockReturnValue("id 0");

    const result = readScene({ sceneIndex: 99 });

    expect(result).toEqual({
      id: null,
      name: null,
      sceneIndex: 99,
    });
  });

  it("handles disabled tempo and time signature", () => {
    liveApiId.mockReturnValue("scene2");
    mockLiveApiGet({
      LiveSet: {
        tracks: children(),
      },
      Scene: {
        name: "Scene with Disabled Properties",
        color: 65280, // Green
        is_empty: 1,
        is_triggered: 1,
        tempo: -1, // -1 indicates disabled tempo
        tempo_enabled: 0,
        time_signature_numerator: -1, // -1 indicates disabled time signature
        time_signature_denominator: -1,
        time_signature_enabled: 0,
      },
    });

    const result = readScene({ sceneIndex: 1 });

    expect(result).toEqual({
      id: "scene2",
      name: "Scene with Disabled Properties (2)",
      sceneIndex: 1,
      clipCount: 0,
      triggered: true,
    });
  });

  it("handles unnamed scenes by showing just the scene number", () => {
    liveApiId.mockReturnValue("scene3");
    mockLiveApiGet({
      LiveSet: {
        tracks: children(),
      },
      Scene: {
        name: "",
        color: 0,
        is_empty: 0,
        is_triggered: 0,
        tempo: 120,
        tempo_enabled: 1,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        time_signature_enabled: 1,
      },
    });

    const result = readScene({ sceneIndex: 2 });

    expect(result).toEqual({
      id: "scene3",
      name: "3",
      sceneIndex: 2,
      clipCount: 0,
      tempo: 120,
      timeSignature: "4/4",
    });
  });

  it("returns clipCount when not including clip details", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set scenes 0":
          return "scene_0";
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip_0_0";
        case "live_set tracks 1 clip_slots 0 clip":
          return "clip_1_0";
        case "live_set tracks 2 clip_slots 0 clip":
          return "id 0"; // No clip in this slot
        default:
          return this._id;
      }
    });

    mockLiveApiGet({
      LiveSet: {
        tracks: children("track1", "track2", "track3"),
      },
      Scene: {
        name: "Scene with 2 Clips",
        color: 16711680,
        is_empty: 0,
        is_triggered: 0,
        tempo: 120,
        tempo_enabled: 1,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        time_signature_enabled: 1,
      },
    });

    const result = readScene({ sceneIndex: 0 });

    expect(result).toEqual({
      id: "scene_0",
      name: "Scene with 2 Clips (1)",
      sceneIndex: 0,
      clipCount: 2,
      tempo: 120,
      timeSignature: "4/4",
    });
  });

  it("includes clip information when includeClips is true", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set scenes 0":
          return "scene_0";
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip_0_0";
        case "live_set tracks 1 clip_slots 0 clip":
          return "clip_1_0";
        default:
          return this._id;
      }
    });

    mockLiveApiGet({
      LiveSet: {
        tracks: children("track1", "track2"),
      },
      Scene: {
        name: "Scene with Clips",
        color: 16711680,
        is_empty: 0,
        is_triggered: 0,
        tempo: 120,
        tempo_enabled: 1,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        time_signature_enabled: 1,
      },
    });

    const result = readScene({
      sceneIndex: 0,
      include: ["clips", "clip-notes"],
    });

    expect(result).toEqual({
      id: "scene_0",
      name: "Scene with Clips (1)",
      sceneIndex: 0,
      tempo: 120,
      timeSignature: "4/4",
      clips: [
        {
          ...expectedClip({ id: "clip_0_0", sceneIndex: 0, trackIndex: 0 }),
          color: undefined,
        },
        {
          ...expectedClip({ id: "clip_1_0", sceneIndex: 0, trackIndex: 1 }),
          color: undefined,
        },
      ].map(({ color: _color, ...clip }) => clip),
    });
  });

  it("includes all available options when '*' is used", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set scenes 0":
          return "scene_0";
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip_0_0";
        case "live_set tracks 1 clip_slots 0 clip":
          return "clip_1_0";
        default:
          return this._id;
      }
    });

    mockLiveApiGet({
      LiveSet: {
        tracks: children("track1", "track2"),
      },
      Scene: {
        name: "Wildcard Test Scene",
        color: 65280,
        is_empty: 0,
        is_triggered: 0,
        tempo: 140,
        tempo_enabled: 1,
        time_signature_numerator: 3,
        time_signature_denominator: 4,
        time_signature_enabled: 1,
      },
    });

    // Test with '*' - should include everything
    const resultWildcard = readScene({
      sceneIndex: 0,
      include: ["*"],
    });

    // Test explicit list - should produce identical result
    const resultExplicit = readScene({
      sceneIndex: 0,
      include: ["clips", "clip-notes", "color", "warp-markers"],
    });

    // Results should be identical
    expect(resultWildcard).toEqual(resultExplicit);

    // Verify key properties are included
    expect(resultWildcard).toEqual(
      expect.objectContaining({
        id: "scene_0",
        name: "Wildcard Test Scene (1)",
        sceneIndex: 0,
        clips: expect.any(Array),
      }),
    );

    // Verify clips array is present
    expect(resultWildcard.clips).toHaveLength(2);
  });

  describe("sceneId parameter", () => {
    it("reads scene by sceneId", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "id 123":
            return "123";
          case "live_set":
            return "live_set_id";
          default:
            return this._id;
        }
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 123") {
          return "live_set scenes 5";
        }
        return this._path;
      });

      mockLiveApiGet({
        "live_set scenes 5": {
          name: "Scene by ID",
          color: 255, // Blue
          is_empty: 0,
          is_triggered: 1,
          tempo: 128,
          tempo_enabled: 1,
          time_signature_numerator: 3,
          time_signature_denominator: 4,
          time_signature_enabled: 1,
        },
        LiveSet: {
          tracks: children(),
        },
      });

      const result = readScene({ sceneId: "123" });

      expect(result).toEqual({
        id: "123",
        name: "Scene by ID (6)",
        sceneIndex: 5,
        clipCount: 0,
        triggered: true,
        tempo: 128,
        timeSignature: "3/4",
      });
    });

    it("includes clips when reading scene by sceneId", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "id 456":
            return "456";
          case "live_set":
            return "live_set_id";
          case "live_set tracks 0 clip_slots 2 clip":
            return "clip_0_2";
          case "live_set tracks 1 clip_slots 2 clip":
            return "clip_1_2";
          default:
            return this._id;
        }
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 456") {
          return "live_set scenes 2";
        }
        return this._path;
      });

      mockLiveApiGet({
        "live_set scenes 2": {
          name: "Scene with Clips by ID",
          color: 16776960, // Yellow
          is_empty: 0,
          is_triggered: 0,
          tempo: 110,
          tempo_enabled: 1,
          time_signature_numerator: 4,
          time_signature_denominator: 4,
          time_signature_enabled: 1,
        },
        LiveSet: {
          tracks: children("track1", "track2"),
        },
      });

      const result = readScene({
        sceneId: "456",
        include: ["clips", "clip-notes"],
      });

      expect(result).toEqual({
        id: "456",
        name: "Scene with Clips by ID (3)",
        sceneIndex: 2,
        tempo: 110,
        timeSignature: "4/4",
        clips: [
          {
            ...expectedClip({ id: "clip_0_2", sceneIndex: 2, trackIndex: 0 }),
            color: undefined,
          },
          {
            ...expectedClip({ id: "clip_1_2", sceneIndex: 2, trackIndex: 1 }),
            color: undefined,
          },
        ].map(({ color: _color, ...clip }) => clip),
      });
    });

    it("throws error when sceneId does not exist", () => {
      liveApiId.mockReturnValue("id 0");

      expect(() => {
        readScene({ sceneId: "nonexistent" });
      }).toThrow('readScene failed: id "nonexistent" does not exist');
    });

    it("throws error when neither sceneId nor sceneIndex provided", () => {
      expect(() => {
        readScene({});
      }).toThrow("Either sceneId or sceneIndex must be provided");
    });

    it("prioritizes sceneId over sceneIndex when both provided", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "id 789":
            return "789";
          case "live_set":
            return "live_set_id";
          default:
            return this._id;
        }
      });
      liveApiPath.mockImplementation(function () {
        if (this._path === "id 789") {
          return "live_set scenes 7";
        }
        return this._path;
      });

      mockLiveApiGet({
        "live_set scenes 7": {
          name: "Priority Test Scene",
          color: 8388736, // Purple
          is_empty: 0,
          is_triggered: 0,
          tempo: 100,
          tempo_enabled: 1,
          time_signature_numerator: 4,
          time_signature_denominator: 4,
          time_signature_enabled: 1,
        },
        LiveSet: {
          tracks: children(),
        },
      });

      // sceneId should take priority over sceneIndex
      const result = readScene({ sceneId: "789", sceneIndex: 3 });

      // Should use scene with ID "789" (index 7) not sceneIndex 3
      expect(result.sceneIndex).toBe(7);
      expect(result.name).toBe("Priority Test Scene (8)");
    });
  });
});
