import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiId, liveApiType } from "../../test/mock-live-api.js";
import { validateIdType, validateIdTypes } from "./id-validation.js";

describe("validateIdType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return LiveAPI instance for valid ID with matching type", () => {
    const id = "track_1";
    liveApiId.mockReturnValue(id);
    liveApiType.mockReturnValue("Track");

    const result = validateIdType(id, "track", "testTool");

    expect(result).toBeDefined();
    expect(result.id).toBe(id);
    expect(result.type).toBe("Track");
  });

  it("should be case-insensitive for type matching", () => {
    const id = "track_1";
    liveApiId.mockReturnValue(id);
    liveApiType.mockReturnValue("Track");

    // Should work with lowercase, uppercase, mixed case
    expect(() => validateIdType(id, "track", "testTool")).not.toThrow();
    expect(() => validateIdType(id, "Track", "testTool")).not.toThrow();
    expect(() => validateIdType(id, "TRACK", "testTool")).not.toThrow();
  });

  it("should throw error when ID does not exist", () => {
    const id = "nonexistent_id";
    liveApiId.mockReturnValue("id 0"); // Mock non-existent

    expect(() => validateIdType(id, "track", "testTool")).toThrow(
      'testTool failed: id "nonexistent_id" does not exist',
    );
  });

  it("should throw error when type does not match", () => {
    const id = "scene_1";
    liveApiId.mockReturnValue(id);
    liveApiType.mockReturnValue("Scene");

    expect(() => validateIdType(id, "track", "testTool")).toThrow(
      'testTool failed: id "scene_1" is not a track (found Scene)',
    );
  });

  it("should include tool name in error messages", () => {
    const id = "scene_1";
    liveApiId.mockReturnValue("id 0"); // Mock non-existent

    expect(() => validateIdType(id, "track", "updateTrack")).toThrow(
      "updateTrack failed:",
    );
  });
});

describe("validateIdTypes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("with skipInvalid=false (default)", () => {
    it("should return array of LiveAPI instances for all valid IDs", () => {
      const ids = ["track_1", "track_2", "track_3"];
      liveApiId.mockImplementation(function () {
        return this._id;
      });
      liveApiType.mockReturnValue("Track");

      const result = validateIdTypes(ids, "track", "testTool");

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("track_1");
      expect(result[1].id).toBe("track_2");
      expect(result[2].id).toBe("track_3");
    });

    it("should throw on first invalid ID (non-existent)", () => {
      const ids = ["track_1", "nonexistent", "track_3"];
      liveApiId.mockImplementation(function () {
        // Return "id 0" for non-existent IDs
        return this._id === "nonexistent" ? "id 0" : this._id;
      });
      liveApiType.mockReturnValue("Track");

      expect(() => validateIdTypes(ids, "track", "testTool")).toThrow(
        'testTool failed: id "nonexistent" does not exist',
      );
    });

    it("should throw on first invalid ID (wrong type)", () => {
      const ids = ["track_1", "scene_1", "track_3"];
      liveApiId.mockImplementation(function () {
        return this._id;
      });
      liveApiType.mockImplementation(function () {
        return this._id === "scene_1" ? "Scene" : "Track";
      });

      expect(() => validateIdTypes(ids, "track", "testTool")).toThrow(
        'testTool failed: id "scene_1" is not a track (found Scene)',
      );
    });
  });

  describe("with skipInvalid=true", () => {
    it("should return only valid IDs and log warnings for invalid", () => {
      const ids = ["track_1", "scene_1", "track_3"];
      liveApiId.mockImplementation(function () {
        return this._id;
      });
      liveApiType.mockImplementation(function () {
        return this._id === "scene_1" ? "Scene" : "Track";
      });

      const consoleErrorSpy = vi.spyOn(console, "error");

      const result = validateIdTypes(ids, "track", "testTool", {
        skipInvalid: true,
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("track_1");
      expect(result[1].id).toBe("track_3");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'testTool: id "scene_1" is not a track (found Scene)',
      );
    });

    it("should return empty array when all IDs are invalid (non-existent)", () => {
      const ids = ["nonexistent_1", "nonexistent_2"];
      liveApiId.mockReturnValue("id 0"); // All non-existent

      const consoleErrorSpy = vi.spyOn(console, "error");

      const result = validateIdTypes(ids, "track", "testTool", {
        skipInvalid: true,
      });

      expect(result).toHaveLength(0);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'testTool: id "nonexistent_1" does not exist',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'testTool: id "nonexistent_2" does not exist',
      );
    });

    it("should return empty array when all IDs are wrong type", () => {
      const ids = ["scene_1", "scene_2"];
      liveApiId.mockImplementation(function () {
        return this._id;
      });
      liveApiType.mockReturnValue("Scene");

      const consoleErrorSpy = vi.spyOn(console, "error");

      const result = validateIdTypes(ids, "track", "testTool", {
        skipInvalid: true,
      });

      expect(result).toHaveLength(0);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it("should handle mix of non-existent and wrong type IDs", () => {
      const ids = ["nonexistent", "scene_1", "track_1"];
      liveApiId.mockImplementation(function () {
        // Return "id 0" for non-existent, actual id for others
        return this._id === "nonexistent" ? "id 0" : this._id;
      });
      liveApiType.mockImplementation(function () {
        return this._id === "scene_1" ? "Scene" : "Track";
      });

      const consoleErrorSpy = vi.spyOn(console, "error");

      const result = validateIdTypes(ids, "track", "testTool", {
        skipInvalid: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("track_1");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'testTool: id "nonexistent" does not exist',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'testTool: id "scene_1" is not a track (found Scene)',
      );
    });
  });
});
