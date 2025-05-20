// src/tools/duplicate.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiSet, mockLiveApiGet } from "../mock-live-api";
import { duplicate } from "./duplicate";

describe("duplicate", () => {
  it("should throw an error when type is missing", () => {
    expect(() => duplicate({ id: "some-id" })).toThrow("duplicate failed: type is required");
  });

  it("should throw an error when id is missing", () => {
    expect(() => duplicate({ type: "track" })).toThrow("duplicate failed: id is required");
  });

  it("should throw an error when type is invalid", () => {
    expect(() => duplicate({ type: "invalid", id: "some-id" })).toThrow(
      "duplicate failed: type must be one of track, scene, clip"
    );
  });

  it("should throw an error when the object doesn't exist", () => {
    liveApiId.mockReturnValue("id 0");
    expect(() => duplicate({ type: "track", id: "nonexistent" })).toThrow(
      'duplicate failed: id "nonexistent" does not exist'
    );
  });

  describe("track duplication", () => {
    it("should duplicate a track", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "track", id: "track1" });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        duplicated: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_track", 0);
      expect(liveApiCall.mock.instances[0].path).toBe("live_set");
    });

    it("should set the track name when provided", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "live_set tracks 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "track", id: "track1", name: "Custom Track Name" });

      expect(result).toStrictEqual({
        type: "track",
        id: "track1",
        name: "Custom Track Name",
        duplicated: true,
      });

      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Track Name");
      expect(liveApiSet.mock.instances[0].path).toBe("live_set tracks 1");

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_track", 0);
      expect(liveApiCall.mock.instances[0].path).toBe("live_set");
    });

    it("should throw an error when track path cannot be parsed", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "track1") {
          return "invalid_path";
        }
        return this._path;
      });
      expect(() => duplicate({ type: "track", id: "track1" })).toThrow(
        'duplicate failed: no track index for id "track1"'
      );
    });
  });

  describe("scene duplication", () => {
    it("should duplicate a scene", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "scene", id: "scene1" });

      expect(result).toStrictEqual({
        type: "scene",
        id: "scene1",
        duplicated: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_scene", 0);
      expect(liveApiCall.mock.instances[0].path).toBe("live_set");
    });

    it("should set the scene name when provided", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "live_set scenes 0";
        }
        return this._path;
      });

      const result = duplicate({ type: "scene", id: "scene1", name: "Custom Scene Name" });

      expect(result).toStrictEqual({
        type: "scene",
        id: "scene1",
        name: "Custom Scene Name",
        duplicated: true,
      });

      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Scene Name");
      expect(liveApiSet.mock.instances[0].path).toBe("live_set scenes 1");

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_scene", 0);
      expect(liveApiCall.mock.instances[0].path).toBe("live_set");
    });

    it("should throw an error when scene path cannot be parsed", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "scene1") {
          return "invalid_path";
        }
        return this._path;
      });

      expect(() => duplicate({ type: "scene", id: "scene1" })).toThrow(
        'duplicate failed: no scene index for id "scene1"'
      );
    });
  });

  describe("clip duplication", () => {
    it("should throw an error when destination is missing", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });
      expect(() => duplicate({ type: "clip", id: "clip1" })).toThrow(
        "duplicate failed: destination is required for type 'clip'"
      );
    });

    it("should throw an error when destination is invalid", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "clip1") {
          return "live_set tracks 0 clip_slots 0 clip";
        }
        return this._path;
      });
      expect(() => duplicate({ type: "clip", id: "clip1", destination: "invalid" })).toThrow(
        "duplicate failed: destination must be 'session' or 'arranger'"
      );
    });

    describe("session destination", () => {
      it("should duplicate a clip to the session view", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });

        const result = duplicate({ type: "clip", id: "clip1", destination: "session" });

        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_slot", 0);
        expect(liveApiCall.mock.instances[0].path).toBe("live_set tracks 0");

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          destination: "session",
          duplicated: true,
        });
      });

      it("should set the clip name when provided", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });

        const result = duplicate({ type: "clip", id: "clip1", destination: "session", name: "Custom Clip Name" });

        expect(result).toStrictEqual({
          type: "clip",
          id: "clip1",
          destination: "session",
          name: "Custom Clip Name",
          duplicated: true,
        });

        expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Clip Name");
        expect(liveApiSet.mock.instances[0].path).toBe("live_set tracks 0 clip_slots 1 clip");

        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_slot", 0);
        expect(liveApiCall.mock.instances[0].path).toBe("live_set tracks 0");
      });

      it("should throw an error when clip path cannot be parsed", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "invalid_path";
          }
          return this._path;
        });

        expect(() => duplicate({ type: "clip", id: "clip1", destination: "session" })).toThrow(
          'duplicate failed: no track or clip slot index for clip id "clip1" (path="invalid_path")'
        );
      });

      it("should throw an error when track doesn't exist", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 99 clip_slots 0 clip";
          }
          return this._path;
        });
        liveApiId.mockImplementation(function () {
          if (this._path === "live_set tracks 99") return "id 0";
          return this._id;
        });
        expect(() => duplicate({ type: "clip", id: "clip1", destination: "session" })).toThrow(
          "duplicate failed: track with index 99 does not exist"
        );
      });
    });

    describe("arranger destination", () => {
      it("should throw an error when arrangerStartTime is missing", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });
        mockLiveApiGet({ clip1: { exists: () => true } });

        expect(() => duplicate({ type: "clip", id: "clip1", destination: "arranger" })).toThrow(
          "duplicate failed: arrangerStartTime is required when destination is 'arranger'"
        );
      });

      it("should duplicate a clip to the arranger view", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "duplicate_clip_to_arrangement") {
            return ["id", "arranger_clip"];
          }
          return null;
        });
        mockLiveApiGet({ clip1: { exists: () => true } });

        const result = duplicate({
          type: "clip",
          id: "clip1",
          destination: "arranger",
          arrangerStartTime: 8,
        });

        expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_to_arrangement", "id clip1", 8);
        expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
        expect(result).toBeDefined();
      });

      it("should set the clip name when provided", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "duplicate_clip_to_arrangement") {
            return ["id", "arranger_clip"];
          }
          return null;
        });
        mockLiveApiGet({ clip1: { exists: () => true } });

        duplicate({
          type: "clip",
          id: "clip1",
          destination: "arranger",
          arrangerStartTime: 8,
          name: "Custom Clip Name",
        });

        expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Clip Name");
      });

      it("should throw an error when track index cannot be parsed", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "invalid_path";
          }
          return this._path;
        });
        mockLiveApiGet({ clip1: { exists: () => true } });

        expect(() =>
          duplicate({
            type: "clip",
            id: "clip1",
            destination: "arranger",
            arrangerStartTime: 8,
          })
        ).toThrow('duplicate failed: no track index for clipId "clip1"');
      });

      it("should throw an error when duplication fails", () => {
        liveApiPath.mockImplementation(function () {
          if (this._id === "clip1") {
            return "live_set tracks 0 clip_slots 0 clip";
          }
          return this._path;
        });
        liveApiCall.mockImplementation(function (method) {
          if (method === "duplicate_clip_to_arrangement") {
            return null; // Simulate failure
          }
          return null;
        });
        mockLiveApiGet({ clip1: { exists: () => true } });

        expect(() =>
          duplicate({
            type: "clip",
            id: "clip1",
            destination: "arranger",
            arrangerStartTime: 8,
          })
        ).toThrow("duplicate failed: clip failed to duplicate");
      });
    });
  });
});
