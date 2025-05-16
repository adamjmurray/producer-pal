// device/tool-duplicate.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiPath, liveApiSet, mockLiveApiGet } from "./mock-live-api";
import { duplicate } from "./tool-duplicate";

describe("duplicate", () => {
  it("should throw an error when type is missing", () => {
    expect(() => duplicate({})).toThrow("duplicate failed: type is required");
  });

  it("should throw an error when type is invalid", () => {
    expect(() => duplicate({ type: "invalid" })).toThrow("duplicate failed: type must be one of");
  });

  describe("track duplication", () => {
    it("should duplicate a track", () => {
      const result = duplicate({ type: "track", trackIndex: 0 });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_track", 0);
      expect(liveApiCall.mock.instances[0].path).toBe("live_set");
      expect(result).toBeDefined();
    });

    it("should set the track name when provided", () => {
      duplicate({ type: "track", trackIndex: 0, name: "Custom Track Name" });

      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Track Name");
      expect(liveApiSet.mock.instances[0].path).toBe("live_set tracks 1");
    });

    it("should throw an error when trackIndex is missing", () => {
      expect(() => duplicate({ type: "track" })).toThrow("duplicate failed: trackIndex is required");
    });
  });

  describe("scene duplication", () => {
    it("should duplicate a scene", () => {
      const result = duplicate({ type: "scene", sceneIndex: 0 });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_scene", 0);
      expect(liveApiCall.mock.instances[0].path).toBe("live_set");
      expect(result).toBeDefined();
    });

    it("should set the scene name when provided", () => {
      duplicate({ type: "scene", sceneIndex: 0, name: "Custom Scene Name" });

      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Scene Name");
      expect(liveApiSet.mock.instances[0].path).toBe("live_set scenes 1");
    });

    it("should throw an error when sceneIndex is missing", () => {
      expect(() => duplicate({ type: "scene" })).toThrow("duplicate failed: sceneIndex is required");
    });
  });

  describe("clip-slot duplication", () => {
    it("should duplicate a clip slot", () => {
      mockLiveApiGet({ Track: { exists: () => true } });

      const result = duplicate({ type: "clip-slot", trackIndex: 0, clipSlotIndex: 0 });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_slot", 0);
      expect(liveApiCall.mock.instances[0].path).toBe("live_set tracks 0");
      expect(result).toBeDefined();
    });

    it("should set the clip name when provided", () => {
      mockLiveApiGet({ Track: { exists: () => true } });

      duplicate({ type: "clip-slot", trackIndex: 0, clipSlotIndex: 0, name: "Custom Clip Name" });

      expect(liveApiSet).toHaveBeenCalledWith("name", "Custom Clip Name");
      expect(liveApiSet.mock.instances[0].path).toBe("live_set tracks 0 clip_slots 1 clip");
    });

    it("should throw an error when trackIndex is missing", () => {
      expect(() => duplicate({ type: "clip-slot" })).toThrow("duplicate failed: trackIndex is required");
    });

    it("should throw an error when clipSlotIndex is missing", () => {
      expect(() => duplicate({ type: "clip-slot", trackIndex: 0 })).toThrow(
        "duplicate failed: clipSlotIndex is required"
      );
    });

    it("should throw an error when track doesn't exist", () => {
      liveApiId.mockReturnValue("id 0");
      expect(() => duplicate({ type: "clip-slot", trackIndex: 99, clipSlotIndex: 0 })).toThrow(
        "duplicate failed: track with index 99 does not exist"
      );
    });
  });

  describe("clip-to-arranger duplication", () => {
    it("should duplicate a clip to arranger", () => {
      liveApiPath.mockImplementation(function () {
        if (this._id === "session_clip") {
          return "live_set tracks 1 clip_slots 0 clip";
        }
        return "";
      });
      liveApiCall.mockImplementation(function (method) {
        if (method === "duplicate_clip_to_arrangement") {
          return ["id", "arranger_clip"];
        }
        return null;
      });

      mockLiveApiGet({ session_clip: { exists: () => true } });

      const result = duplicate({
        type: "clip-to-arranger",
        clipId: "session_clip",
        arrangerStartTime: 8,
      });

      expect(liveApiCall).toHaveBeenCalledWith("duplicate_clip_to_arrangement", "id session_clip", 8);
      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
      expect(result).toBeDefined();
    });

    it("should throw an error when clipId is missing", () => {
      expect(() =>
        duplicate({
          type: "clip-to-arranger",
          arrangerStartTime: 8,
        })
      ).toThrow("duplicate failed: clipId is required");
    });

    it("should throw an error when arrangerStartTime is missing", () => {
      expect(() =>
        duplicate({
          type: "clip-to-arranger",
          clipId: "clip_1",
        })
      ).toThrow("duplicate failed: arrangerStartTime is required");
    });
  });
});
