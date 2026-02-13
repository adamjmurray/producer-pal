// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LiveAPI,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import {
  rawLiveApi,
  type RawApiOperation,
} from "#src/tools/control/raw-live-api.ts";

describe("rawLiveApi", () => {
  let defaultMock: RegisteredMockObject;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();

    // Register default mock for "live_set" path (rawLiveApi's default)
    // Use ID "1" so api.id returns "id 1"
    defaultMock = registerMockObject("1", {
      path: "live_set",
      type: "Song",
      methods: {
        get_current_beats_song_time: () => "001.01.01.000",
      },
    });

    // Mock LiveAPI extensions that get added to instances
    LiveAPI.prototype.getProperty = vi.fn(function (
      this: MockLiveAPIContext & { get: (prop: string) => unknown },
      property: string,
    ) {
      const result = this.get(property);

      return Array.isArray(result) ? result[0] : result;
    }) as (property: string) => unknown;

    LiveAPI.prototype.getChildIds = vi.fn((childType: string) => {
      if (!childType) {
        throw new Error("Missing child type");
      }

      return [`id_${childType}_1`, `id_${childType}_2`];
    }) as (name: string) => string[];

    LiveAPI.prototype.exists = vi.fn(() => true) as () => boolean;

    LiveAPI.prototype.getColor = vi.fn(() => "#FF0000") as () => string;

    LiveAPI.prototype.setColor = vi.fn((color: string) => color) as (
      color: string,
    ) => string;

    // goto is not on the mock LiveAPI type, so cast to assign it
    (LiveAPI.prototype as unknown as Record<string, unknown>).goto = vi.fn(
      function (this: MockLiveAPIContext, path: string) {
        this._path = path;
        this._id = path.replaceAll(/\s+/g, "/");
        // Clear registration so getters use updated _path/_id
        this._registered = undefined;

        return 1;
      },
    );
  });

  describe("input validation", () => {
    it("should throw error if operations is not an array", () => {
      expect(() =>
        rawLiveApi({ operations: "not-array" } as unknown as Parameters<
          typeof rawLiveApi
        >[0]),
      ).toThrow("operations must be an array");
    });

    it("should throw error if operations array exceeds 50 operations", () => {
      const operations = Array(51).fill({
        type: "info",
      }) as RawApiOperation[];

      expect(() => rawLiveApi({ operations })).toThrow(
        "operations array cannot exceed 50 operations",
      );
    });

    it("should throw error for unknown operation type", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "unknown" }],
        } as unknown as Parameters<typeof rawLiveApi>[0]),
      ).toThrow("Unknown operation type: unknown");
    });
  });

  describe("core operations", () => {
    it("should handle get_property operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "get_property", property: "id" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.operation.type).toBe("get_property");
      expect(result.results[0]!.result).toBe("1"); // Default mock has bare id "1"
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
      expect(result.results[0]!.operation.type).toBe("set_property");
      expect(result.results[0]!.result).toBe(140);
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
      defaultMock.get.mockReturnValueOnce([120]);

      const result = rawLiveApi({
        operations: [{ type: "call_method", method: "get", args: ["tempo"] }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.operation.type).toBe("call_method");
      expect(result.results[0]!.result).toStrictEqual([120]);
      expect(defaultMock.get).toHaveBeenCalledWith("tempo");
    });

    it("should throw error for call_method without method", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "call_method", args: ["tempo"] }],
        }),
      ).toThrow("call_method operation requires method");
    });

    it("should throw error for call_method with non-existent method", () => {
      expect(() =>
        rawLiveApi({
          operations: [
            { type: "call_method", method: "nonExistentMethod", args: [] },
          ],
        }),
      ).toThrow('Method "nonExistentMethod" not found on LiveAPI object');
    });
  });

  describe("convenience shortcuts", () => {
    it("should handle get operation", () => {
      defaultMock.get.mockReturnValueOnce([120]);

      const result = rawLiveApi({
        operations: [{ type: "get", property: "tempo" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.result).toStrictEqual([120]);
      expect(defaultMock.get).toHaveBeenCalledWith("tempo");
    });

    it("should throw error for get without property", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "get" }],
        }),
      ).toThrow("get operation requires property");
    });

    it("should handle set operation", () => {
      defaultMock.set.mockReturnValueOnce(1);

      const result = rawLiveApi({
        operations: [{ type: "set", property: "tempo", value: 130 }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.result).toBe(1);
      expect(defaultMock.set).toHaveBeenCalledWith("tempo", 130);
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
      expect(result.results[0]!.result).toBe("001.01.01.000");
      expect(defaultMock.call).toHaveBeenCalledWith(
        "get_current_beats_song_time",
      );
    });

    it("should throw error for call without method", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "call" }],
        }),
      ).toThrow("call operation requires method");
    });

    it("should handle goto operation", () => {
      // Register mock for the goto target path
      registerMockObject("track-0", {
        path: "live_set tracks 0",
        type: "Track",
      });

      const result = rawLiveApi({
        operations: [{ type: "goto", value: "live_set tracks 0" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.result).toBe(1);
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

      Object.defineProperty(LiveAPI.prototype, "info", {
        get: () => mockInfo,
        configurable: true,
      });

      const result = rawLiveApi({
        operations: [{ type: "info" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.result).toBe(mockInfo);
    });
  });

  describe("extension shortcuts", () => {
    it("should handle getProperty operation", () => {
      defaultMock.get.mockReturnValueOnce(["Test Track"]);

      const result = rawLiveApi({
        operations: [{ type: "getProperty", property: "name" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.result).toBe("Test Track");
      expect(LiveAPI.prototype.getProperty).toHaveBeenCalledWith("name");
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
      expect(result.results[0]!.result).toStrictEqual([
        "id_clip_slots_1",
        "id_clip_slots_2",
      ]);
      expect(LiveAPI.prototype.getChildIds).toHaveBeenCalledWith("clip_slots");
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
      expect(result.results[0]!.result).toBe(true);
      expect(LiveAPI.prototype.exists).toHaveBeenCalled();
    });

    it("should handle getColor operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "getColor" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.result).toBe("#FF0000");
      expect(LiveAPI.prototype.getColor).toHaveBeenCalled();
    });

    it("should handle setColor operation", () => {
      const result = rawLiveApi({
        operations: [{ type: "setColor", value: "#00FF00" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.result).toBe("#00FF00");
      expect(LiveAPI.prototype.setColor).toHaveBeenCalledWith("#00FF00");
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
      const trackMock = registerMockObject("track-0", {
        path: "live_set tracks 0",
        type: "Track",
      });

      Object.defineProperty(LiveAPI.prototype, "info", {
        get: () => "Track info",
        configurable: true,
      });

      const result = rawLiveApi({
        path: "live_set tracks 0",
        operations: [{ type: "info" }],
      });

      expect(result.path).toBe("live_set tracks 0");
      expect(trackMock).toBeDefined();
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
      defaultMock.get.mockReturnValueOnce([120]);
      Object.defineProperty(LiveAPI.prototype, "info", {
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
      expect(result.results[0]!.operation.type).toBe("get_property");
      expect(result.results[1]!.operation.type).toBe("get");
      expect(result.results[2]!.operation.type).toBe("info");
    });

    it("should return operation details with each result", () => {
      defaultMock.get.mockReturnValueOnce([120]);

      const result = rawLiveApi({
        operations: [{ type: "get", property: "tempo" }],
      });

      expect(result.results[0]!.operation).toStrictEqual({
        type: "get",
        property: "tempo",
      });
      expect(result.results[0]!.result).toStrictEqual([120]);
    });
  });

  describe("return format", () => {
    it("should return path, id, and results", () => {
      Object.defineProperty(LiveAPI.prototype, "info", {
        get: () => "Mock LiveAPI info",
        configurable: true,
      });

      const result = rawLiveApi({
        path: "live_set",
        operations: [{ type: "info" }],
      });

      expect(result).toStrictEqual({
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

  describe("error handling", () => {
    it("should throw error for unknown operation type", () => {
      expect(() =>
        rawLiveApi({
          operations: [{ type: "unknown_operation" }],
        } as unknown as Parameters<typeof rawLiveApi>[0]),
      ).toThrow("Unknown operation type: unknown_operation");
    });
  });
});
