import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
} from "#src/test/mock-live-api.js";
import { rawLiveApi } from "../raw-live-api.js";

describe("rawLiveApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock behaviors for extension methods
    liveApiCall.mockImplementation(function (method, ...args) {
      switch (method) {
        case "get_current_beats_song_time":
          return "001.01.01.000";
        default:
          return `called_${method}_with_${args.join("_")}`;
      }
    });

    // Mock LiveAPI extensions that get added to instances
    global.LiveAPI.prototype.getProperty = vi.fn(function (property) {
      const result = this.get(property);

      return Array.isArray(result) ? result[0] : result;
    });

    global.LiveAPI.prototype.getChildIds = vi.fn((childType) => {
      if (!childType) {
        throw new Error("Missing child type");
      }

      return [`id_${childType}_1`, `id_${childType}_2`];
    });

    global.LiveAPI.prototype.exists = vi.fn(() => true);

    global.LiveAPI.prototype.getColor = vi.fn(() => "#FF0000");

    global.LiveAPI.prototype.setColor = vi.fn((color) => color);

    global.LiveAPI.prototype.goto = vi.fn(function (path) {
      this._path = path;
      this._id = path.replace(/\s+/g, "/");

      return 1;
    });
  });

  describe("input validation", () => {
    it("should throw error if operations is not an array", () => {
      expect(() => rawLiveApi({ operations: "not-array" })).toThrow(
        "operations must be an array",
      );
    });

    it("should throw error if operations array exceeds 50 operations", () => {
      const operations = Array(51).fill({ type: "info" });

      expect(() => rawLiveApi({ operations })).toThrow(
        "operations array cannot exceed 50 operations",
      );
    });

    it("should throw error for unknown operation type", () => {
      expect(() => rawLiveApi({ operations: [{ type: "unknown" }] })).toThrow(
        "Unknown operation type: unknown",
      );
    });
  });

  describe("core operations", () => {
    it("should handle get_property operation", () => {
      liveApiId.mockReturnValue("test-id");

      const result = rawLiveApi({
        operations: [{ type: "get_property", property: "id" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].operation.type).toBe("get_property");
      expect(result.results[0].result).toBe("test-id");
    });

    it("should throw error for get_property without property", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "get_property" }],
        }),
      ).toThrow("get_property operation requires property");
    });

    it("should handle set_property operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "set_property", property: "tempo", value: 140 }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].operation.type).toBe("set_property");
      expect(result.results[0].result).toBe(140);
    });

    it("should throw error for set_property without property", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "set_property", value: 140 }],
        }),
      ).toThrow("set_property operation requires property");
    });

    it("should throw error for set_property without value", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "set_property", property: "tempo" }],
        }),
      ).toThrow("set_property operation requires value");
    });

    it("should handle call_method operation", () => {
      liveApiGet.mockReturnValueOnce([120]);

      const result = rawLiveApi({
        operations: [{ type: "call_method", method: "get", args: ["tempo"] }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].operation.type).toBe("call_method");
      expect(result.results[0].result).toEqual([120]);
      expect(liveApiGet).toHaveBeenCalledWith("tempo");
    });

    it("should throw error for call_method without method", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "call_method", args: ["tempo"] }],
        }),
      ).toThrow("call_method operation requires method");
    });
  });

  describe("convenience shortcuts", () => {
    it("should handle get operation", () => {
      liveApiGet.mockReturnValueOnce([120]);

      const result = rawLiveApi({
        operations: [{ type: "get", property: "tempo" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toEqual([120]);
      expect(liveApiGet).toHaveBeenCalledWith("tempo");
    });

    it("should throw error for get without property", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "get" }],
        }),
      ).toThrow("get operation requires property");
    });

    it("should handle set operation", () => {
      liveApiSet.mockReturnValueOnce(1);

      const result = rawLiveApi({
        operations: [{ type: "set", property: "tempo", value: 130 }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toBe(1);
      expect(liveApiSet).toHaveBeenCalledWith("tempo", 130);
    });

    it("should throw error for set without property", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "set", value: 130 }],
        }),
      ).toThrow("set operation requires property");
    });

    it("should throw error for set without value", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "set", property: "tempo" }],
        }),
      ).toThrow("set operation requires value");
    });

    it("should handle call operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "call", method: "get_current_beats_song_time" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toBe("001.01.01.000");
      expect(liveApiCall).toHaveBeenCalledWith("get_current_beats_song_time");
    });

    it("should throw error for call without method", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "call" }],
        }),
      ).toThrow("call operation requires method");
    });

    it("should handle goto operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "goto", value: "live_set tracks 0" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toBe(1);
      expect(result.path).toBe("live_set tracks 0");
    });

    it("should throw error for goto without value", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "goto" }],
        }),
      ).toThrow("goto operation requires value (path)");
    });

    it("should handle info operation", () => {
      const mockInfo = "Mock LiveAPI info";

      Object.defineProperty(global.LiveAPI.prototype, "info", {
        get: () => mockInfo,
        configurable: true,
      });

      const result = rawLiveApi({
        operations: [{ type: "info" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toBe(mockInfo);
    });
  });

  describe("extension shortcuts", () => {
    it("should handle getProperty operation", () => {
      liveApiGet.mockReturnValueOnce(["Test Track"]);

      const result = rawLiveApi({
        operations: [{ type: "getProperty", property: "name" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toBe("Test Track");
      expect(global.LiveAPI.prototype.getProperty).toHaveBeenCalledWith("name");
    });

    it("should throw error for getProperty without property", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "getProperty" }],
        }),
      ).toThrow("getProperty operation requires property");
    });

    it("should handle getChildIds operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "getChildIds", property: "clip_slots" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toEqual([
        "id_clip_slots_1",
        "id_clip_slots_2",
      ]);
      expect(global.LiveAPI.prototype.getChildIds).toHaveBeenCalledWith(
        "clip_slots",
      );
    });

    it("should throw error for getChildIds without property", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "getChildIds" }],
        }),
      ).toThrow("getChildIds operation requires property (child type)");
    });

    it("should handle exists operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "exists" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toBe(true);
      expect(global.LiveAPI.prototype.exists).toHaveBeenCalled();
    });

    it("should handle getColor operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "getColor" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toBe("#FF0000");
      expect(global.LiveAPI.prototype.getColor).toHaveBeenCalled();
    });

    it("should handle setColor operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "setColor", value: "#00FF00" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].result).toBe("#00FF00");
      expect(global.LiveAPI.prototype.setColor).toHaveBeenCalledWith("#00FF00");
    });

    it("should throw error for setColor without value", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "setColor" }],
        }),
      ).toThrow("setColor operation requires value (color)");
    });
  });

  describe("path handling", () => {
    it("should create LiveAPI with path when provided", () => {
      liveApiPath.mockReturnValue("live_set tracks 0");

      const result = rawLiveApi({
        path: "live_set tracks 0",
        operations: [{ type: "info" }],
      });

      expect(result.path).toBe("live_set tracks 0");
    });

    it("should create LiveAPI without path when not provided", () => {
      const result = rawLiveApi({
        operations: [{ type: "info" }],
      });

      // When no path is provided, path should be undefined
      expect(result.path).toBeUndefined();
    });
  });

  describe("multiple operations", () => {
    it("should handle multiple operations sequentially", () => {
      liveApiId.mockReturnValue("test-id");
      liveApiGet.mockReturnValueOnce([120]);
      Object.defineProperty(global.LiveAPI.prototype, "info", {
        get: () => "Mock info",
        configurable: true,
      });

      const result = rawLiveApi({
        operations: [
          { type: "get_property", property: "id" },
          { type: "get", property: "tempo" },
          { type: "info" },
        ],
      });

      expect(result.results).toHaveLength(3);
      expect(result.results[0].operation.type).toBe("get_property");
      expect(result.results[1].operation.type).toBe("get");
      expect(result.results[2].operation.type).toBe("info");
    });

    it("should return operation details with each result", () => {
      liveApiGet.mockReturnValueOnce([120]);

      const result = rawLiveApi({
        operations: [{ type: "get", property: "tempo" }],
      });

      expect(result.results[0].operation).toEqual({
        type: "get",
        property: "tempo",
      });
      expect(result.results[0].result).toEqual([120]);
    });
  });

  describe("return format", () => {
    it("should return path, id, and results", () => {
      liveApiPath.mockReturnValue("live_set");
      liveApiId.mockReturnValue("1");
      Object.defineProperty(global.LiveAPI.prototype, "info", {
        get: () => "Mock LiveAPI info",
        configurable: true,
      });

      const result = rawLiveApi({
        path: "live_set",
        operations: [{ type: "info" }],
      });

      expect(result).toEqual({
        path: "live_set",
        id: "1",
        results: [
          {
            operation: { type: "info" },
            result: "Mock LiveAPI info",
          },
        ],
      });
    });
  });
});
