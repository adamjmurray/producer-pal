import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  children,
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import {
  calculateSceneLength,
  duplicateScene,
  duplicateSceneToArrangement,
  duplicateTrack,
} from "./duplicate-track-scene-helpers.js";

// Mock updateClip to avoid complex internal logic
vi.mock(import("#src/tools/clip/update/update-clip.js"), () => ({
  updateClip: vi.fn(({ ids }) => {
    return [{ id: ids }];
  }),
}));

// Mock arrangement-tiling helpers
vi.mock(import("#src/tools/shared/arrangement/arrangement-tiling.js"), () => ({
  createShortenedClipInHolding: vi.fn(() => ({
    holdingClipId: "holding_clip_id",
  })),
  moveClipFromHolding: vi.fn((_holdingClipId, track, _startBeats) => {
    const clipId = `${track.path} arrangement_clips 0`;

    return {
      id: clipId,
      path: clipId,
      set: vi.fn(),
      getProperty: vi.fn((prop) => {
        if (prop === "is_arrangement_clip") {
          return 1;
        }

        if (prop === "start_time") {
          return _startBeats;
        }

        return null;
      }),
      get trackIndex() {
        const match = clipId.match(/tracks (\d+)/);

        return match ? Number.parseInt(match[1]) : null;
      },
    };
  }),
}));

// Mock getHostTrackIndex
vi.mock(
  import("#src/tools/shared/arrangement/get-host-track-index.js"),
  () => ({
    getHostTrackIndex: vi.fn(() => 0),
  }),
);

describe("duplicate-track-scene-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    liveApiId.mockImplementation(function () {
      if (this.path === "live_set") {
        return "id 1";
      }

      return `id ${Math.random()}`;
    });

    liveApiGet.mockImplementation(function (property) {
      if (this.path === "live_set" && property === "tracks") {
        return ["id", "10", "id", "11", "id", "12"];
      }

      return [];
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });
  });

  describe("calculateSceneLength", () => {
    it("should return default minimum length when scene has no clips", () => {
      liveApiGet.mockImplementation(function (property) {
        if (property === "tracks") {
          return ["id", "10"];
        }

        if (property === "has_clip") {
          return [0];
        }

        return [];
      });

      const length = calculateSceneLength(0);

      expect(length).toBe(4);
    });

    it("should return length of longest clip in scene", () => {
      liveApiGet.mockImplementation(function (property) {
        if (this.path === "live_set" && property === "tracks") {
          return ["id", "10", "id", "11"];
        }

        if (property === "has_clip") {
          return [1];
        }

        if (property === "length") {
          if (this.path.includes("tracks 0")) {
            return [8];
          }

          if (this.path.includes("tracks 1")) {
            return [12];
          }
        }

        return [];
      });

      const length = calculateSceneLength(0);

      expect(length).toBe(12);
    });
  });

  describe("duplicateTrack", () => {
    it("should duplicate a track and return basic info", () => {
      mockLiveApiGet({
        "live_set tracks 1": {
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      const result = duplicateTrack(0);

      expect(result).toMatchObject({
        trackIndex: 1,
        clips: [],
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_track",
        0,
      );
    });

    it("should set name when provided", () => {
      mockLiveApiGet({
        "live_set tracks 1": {
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      duplicateTrack(0, "New Track");

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "name",
        "New Track",
      );
    });

    it("should delete all devices when withoutDevices is true", () => {
      mockLiveApiGet({
        "live_set tracks 1": {
          devices: children("device0", "device1", "device2"),
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      duplicateTrack(0, null, false, true);

      // Verify delete_device was called for each device (backwards)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_device",
        2,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_device",
        1,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_device",
        0,
      );
    });

    it("should delete clips when withoutClips is true", () => {
      mockLiveApiGet({
        "live_set tracks 1": {
          devices: [],
          clip_slots: children("slot0", "slot1"),
          arrangement_clips: children("arrClip0"),
        },
        "id slot0": { has_clip: 1 },
        "id slot1": { has_clip: 0 },
      });

      duplicateTrack(0, null, true);

      // Should delete arrangement clips on the track
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 1" }),
        "delete_clip",
        "id arrClip0",
      );
    });

    it("should return empty clips array when no clips exist", () => {
      mockLiveApiGet({
        "live_set tracks 1": {
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
        },
      });

      const result = duplicateTrack(0);

      expect(result.clips).toHaveLength(0);
    });

    it("should configure routing when routeToSource is true", () => {
      mockLiveApiGet({
        "live_set tracks 0": {
          name: "Source Track",
          arm: 0,
          input_routing_type: { display_name: "Audio In" },
          available_input_routing_types: [
            { display_name: "No Input", identifier: "no_input_id" },
          ],
        },
        "live_set tracks 1": {
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          available_output_routing_types: [
            { display_name: "Source Track", identifier: "source_track_id" },
          ],
        },
      });

      duplicateTrack(0, null, false, false, true, 0);

      // Should arm source track
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "arm",
        1,
      );
    });

    it("should not log arming when track is already armed", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockLiveApiGet({
        "live_set tracks 0": {
          name: "Source Track",
          arm: 1,
          input_routing_type: { display_name: "No Input" },
          available_input_routing_types: [],
        },
        "live_set tracks 1": {
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          available_output_routing_types: [
            { display_name: "Source Track", identifier: "source_track_id" },
          ],
        },
      });

      duplicateTrack(0, null, false, false, true, 0);

      // Should not log about arming since it was already armed
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Armed the source track"),
      );
      consoleErrorSpy.mockRestore();
    });

    it("should warn when track routing option is not found", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      mockLiveApiGet({
        "live_set tracks 0": {
          name: "Source Track",
          arm: 1,
          input_routing_type: { display_name: "No Input" },
          available_input_routing_types: [],
        },
        "live_set tracks 1": {
          devices: [],
          clip_slots: [],
          arrangement_clips: [],
          available_output_routing_types: [
            { display_name: "Other Track", identifier: "other_track_id" },
          ],
        },
      });

      duplicateTrack(0, null, false, false, true, 0);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Could not find track "Source Track" in routing options',
        ),
      );
      consoleErrorSpy.mockRestore();
    });

    it("should delete session clips when withoutClips is true", () => {
      mockLiveApiGet({
        "live_set tracks 1": {
          devices: [],
          clip_slots: children("slot0"),
          arrangement_clips: [],
        },
        "id slot0": { has_clip: 1 },
      });

      duplicateTrack(0, null, true);

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: expect.stringContaining("slot0") }),
        "delete_clip",
      );
    });
  });

  describe("duplicateScene", () => {
    it("should duplicate a scene and return basic info", () => {
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
        },
        "live_set tracks 0 clip_slots 1": { has_clip: 0 },
      });

      const result = duplicateScene(0);

      expect(result).toMatchObject({
        sceneIndex: 1,
        clips: [],
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "duplicate_scene",
        0,
      );
    });

    it("should set name when provided", () => {
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
        },
        "live_set tracks 0 clip_slots 1": { has_clip: 0 },
      });

      duplicateScene(0, "New Scene");

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set scenes 1" }),
        "name",
        "New Scene",
      );
    });

    it("should delete clips when withoutClips is true", () => {
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0", "track1"),
        },
        "live_set tracks 0 clip_slots 1": { has_clip: 1 },
        "live_set tracks 1 clip_slots 1": { has_clip: 1 },
      });

      const result = duplicateScene(0, null, true);

      expect(result.clips).toHaveLength(0);

      // Should delete clips
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: expect.stringContaining("clip_slots 1"),
        }),
        "delete_clip",
      );
    });

    it("should collect clips when withoutClips is not true", () => {
      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
        },
        "live_set tracks 0 clip_slots 1": { has_clip: 1 },
        Clip: {
          is_arrangement_clip: 0,
        },
      });

      const result = duplicateScene(0);

      expect(result.clips).toHaveLength(1);
    });
  });

  describe("duplicateSceneToArrangement", () => {
    it("should throw error when scene does not exist", () => {
      liveApiId.mockImplementation(function () {
        return "id 0"; // Non-existent
      });

      expect(() =>
        duplicateSceneToArrangement("scene123", 16, null, false, null, 4, 4),
      ).toThrow('duplicate failed: scene with id "scene123" does not exist');
    });

    it("should throw error when scene has no sceneIndex", () => {
      liveApiId.mockImplementation(function () {
        return "id 123";
      });

      liveApiPath.mockImplementation(function () {
        return "some/invalid/path"; // No scenes pattern
      });

      expect(() =>
        duplicateSceneToArrangement("scene123", 16, null, false, null, 4, 4),
      ).toThrow('duplicate failed: no scene index for id "scene123"');
    });

    it("should return empty clips when withoutClips is true", () => {
      liveApiPath.mockImplementation(function () {
        // LiveAPI.from("scene1") creates instance with _path = "scene1"
        if (this._path === "scene1") {
          return "live_set scenes 0";
        }

        return this._path;
      });

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
      });

      const result = duplicateSceneToArrangement(
        "scene1",
        16,
        null,
        true,
        null,
        4,
        4,
      );

      expect(result).toMatchObject({
        arrangementStart: "5|1",
        clips: [],
      });
    });

    it("should use provided arrangementLength", () => {
      liveApiPath.mockImplementation(function () {
        // LiveAPI.from("scene1") creates instance with _path = "scene1"
        if (this._path === "scene1") {
          return "live_set scenes 0";
        }

        return this._path;
      });

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": {
          length: 4,
          signature_numerator: 4,
          signature_denominator: 4,
          is_midi_clip: 1,
        },
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", "live_set tracks 0 arrangement_clips 0"];
        }

        return null;
      });

      const result = duplicateSceneToArrangement(
        "scene1",
        16,
        null,
        false,
        "2:0", // 8 beats
        4,
        4,
      );

      expect(result).toHaveProperty("arrangementStart");
      expect(result).toHaveProperty("clips");
    });

    it("should use calculateSceneLength when arrangementLength is not provided", () => {
      liveApiPath.mockImplementation(function () {
        // LiveAPI.from("scene1") creates instance with _path = "scene1"
        if (this._path === "scene1") {
          return "live_set scenes 0";
        }

        return this._path;
      });

      mockLiveApiGet({
        LiveSet: {
          tracks: children("track0"),
        },
        "live_set tracks 0 clip_slots 0": { has_clip: 1 },
        "live_set tracks 0 clip_slots 0 clip": {
          length: 8,
          signature_numerator: 4,
          signature_denominator: 4,
          is_midi_clip: 1,
        },
      });

      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", "live_set tracks 0 arrangement_clips 0"];
        }

        return null;
      });

      const originalGet = liveApiGet.getMockImplementation();

      liveApiGet.mockImplementation(function (prop) {
        if (
          this._path.includes("arrangement_clips") &&
          prop === "is_arrangement_clip"
        ) {
          return [1];
        }

        if (this._path.includes("arrangement_clips") && prop === "start_time") {
          return [16];
        }

        return originalGet ? originalGet.call(this, prop) : [];
      });

      const result = duplicateSceneToArrangement(
        "scene1",
        16,
        "Scene Name",
        false,
        null,
        4,
        4,
      );

      expect(result).toHaveProperty("arrangementStart", "5|1");
      expect(result).toHaveProperty("clips");
    });
  });
});
