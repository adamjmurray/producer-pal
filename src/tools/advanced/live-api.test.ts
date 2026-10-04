// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginLiveApiScope,
  endLiveApiScope,
  resetLiveApiTracking,
} from "#src/live-api-adapter/live-api-release.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LiveAPI,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { liveApi } from "#src/tools/advanced/live-api.ts";
import { type LiveApiOperation } from "#src/tools/advanced/live-api-operations.ts";

describe("liveApi", () => {
  let defaultMock: RegisteredMockObject;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();

    // Register default mock for "live_set" path (liveApi's default)
    // Use ID "1" so api.id returns "id 1"
    defaultMock = registerMockObject("1", {
      path: livePath.liveSet,
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

    // goto/getcount/getstring are not on the mock LiveAPI type, so cast to assign them
    const proto = LiveAPI.prototype as unknown as Record<string, unknown>;

    proto.goto = vi.fn(function (this: MockLiveAPIContext, path: string) {
      this._path = path;
      this._id = path.replaceAll(/\s+/g, "/");
      // Clear registration so getters use updated _path/_id
      this._registered = undefined;

      return 1;
    });

    proto.getcount = vi.fn(() => 4);
    proto.getstring = vi.fn((property: string) => `<${property}>`);
  });

  /**
   * Run one operation that reads the tempo, and check the one result it gives.
   * @param operation - The operation, whose answer is the mocked tempo
   */
  function expectTempoRead(operation: LiveApiOperation): void {
    defaultMock.get.mockReturnValueOnce([120]);

    const result = liveApi({ operations: [operation] });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toStrictEqual([120]);
    expect(defaultMock.get).toHaveBeenCalledWith("tempo");
  }

  describe("input validation", () => {
    it("should throw error if operations is not an array", () => {
      expect(() =>
        liveApi({ operations: "not-array" } as unknown as Parameters<
          typeof liveApi
        >[0]),
      ).toThrow("operations must be an array");
    });

    it("should throw error if operations array exceeds 50 operations", () => {
      const operations = Array.from(
        { length: 51 },
        () => ({ type: "info" }) as LiveApiOperation,
      );

      expect(() => liveApi({ operations })).toThrow(
        "operations array cannot exceed 50 operations",
      );
    });

    it("should not throw when operations array has exactly 50 operations", () => {
      // Boundary: MAX_OPERATIONS is 50, so exactly 50 is allowed (> not >=).
      const operations = Array.from(
        { length: 50 },
        () => ({ type: "exists" }) as LiveApiOperation,
      );

      const result = liveApi({ operations });

      expect(result.results).toHaveLength(50);
    });

    it("should throw error for unknown operation type", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "unknown" }],
        } as unknown as Parameters<typeof liveApi>[0]),
      ).toThrow("Unknown operation type: unknown");
    });

    // The type or the param is the mistake and nothing says which, so the call
    // is refused whole, before the operations before it have run.
    it.each([
      [
        { type: "get", property: "tempo", method: "x" },
        'method is only for type "call" or "call-method"; this call has type "get". Change the type or drop method.',
      ],
      [
        { type: "call", method: "stop_all_clips", property: "x" },
        "property is only for type",
      ],
      [
        { type: "get", property: "tempo", args: [1] },
        'args is only for type "call" or "call-method"',
      ],
      [{ type: "get", property: "tempo", value: 1 }, "value is only for type"],
      [{ type: "info", value: 1 }, "value is only for type"],
    ])("refuses %j", (operation, message) => {
      const first = { type: "set", property: "name", value: "A" };

      expect(() =>
        liveApi({
          operations: [first, operation] as unknown as LiveApiOperation[],
        }),
      ).toThrow(`operations[1] (counting from 0): ${message}`);
      expect(defaultMock.set).not.toHaveBeenCalled();
    });

    it("counts a blank as not sent", () => {
      expect(() =>
        liveApi({
          operations: [
            { type: "exists", property: "", value: "" },
          ] as unknown as LiveApiOperation[],
        }),
      ).not.toThrow();
    });
  });

  describe("core operations", () => {
    it("should handle get-field operation", () => {
      const result = liveApi({
        operations: [{ type: "get-field", property: "id" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe("1"); // Default mock has bare id "1"
    });

    it("should throw error for get-field without property", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "get-field" }],
        }),
      ).toThrow("get-field operation requires property");
    });

    it("should handle set-property operation", () => {
      const result = liveApi({
        operations: [{ type: "set-property", property: "tempo", value: 140 }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe(140);
    });

    it("should throw error for set-property without property", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "set-property", value: 140 }],
        }),
      ).toThrow("set-property operation requires property");
    });

    it("should throw error for set-property without value", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "set-property", property: "tempo" }],
        }),
      ).toThrow("set-property operation requires value");
    });

    it("should handle call-method operation", () => {
      expectTempoRead({ type: "call-method", method: "get", args: ["tempo"] });
    });

    it("should handle call-method operation without args", () => {
      // No args → executeOperation applies the default [] (empty argument list).
      defaultMock.get.mockReturnValueOnce([120]);

      const result = liveApi({
        operations: [{ type: "call-method", method: "get" }],
      });

      expect(result.results[0]).toStrictEqual([120]);
      expect(defaultMock.get).toHaveBeenCalledWith();
    });

    it("should throw error for call-method without method", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "call-method", args: ["tempo"] }],
        }),
      ).toThrow("call-method operation requires method");
    });

    it("should throw error for call-method with non-existent method", () => {
      expect(() =>
        liveApi({
          operations: [
            { type: "call-method", method: "nonExistentMethod", args: [] },
          ],
        }),
      ).toThrow('Method "nonExistentMethod" not found on LiveAPI object');
    });

    it("should forget an object whose peer it just freed", () => {
      // A freed peer on the free list would be handed to a later request.
      const freed: LiveAPI[] = [];
      const prototype = LiveAPI.prototype as unknown as {
        freepeer?: (this: LiveAPI) => void;
      };

      prototype.freepeer = function (this: LiveAPI) {
        freed.push(this);
      };

      try {
        resetLiveApiTracking();
        beginLiveApiScope();

        liveApi({ operations: [{ type: "call-method", method: "freepeer" }] });

        endLiveApiScope();
        beginLiveApiScope();

        expect(LiveAPI.from(livePath.liveSet)).not.toBe(freed[0]);

        endLiveApiScope();
      } finally {
        delete prototype.freepeer;
      }
    });
  });

  describe("memo isolation", () => {
    // This tool is the only caller that retargets its object in place, so it
    // must not be handed one the rest of the request is sharing, and must not
    // leave a retargeted one behind under the path it started from.
    it("keeps its retargeted object out of the request's memo", () => {
      const before = LiveAPI.from(livePath.liveSet);

      liveApi({
        path: "live_set",
        operations: [{ type: "goto", value: String(livePath.track(0)) }],
      });

      const after = LiveAPI.from(livePath.liveSet);

      expect(after).not.toBe(before);
      expect(after.path).toBe(livePath.liveSet);
    });
  });

  describe("convenience shortcuts", () => {
    it("should handle get operation", () => {
      expectTempoRead({ type: "get", property: "tempo" });
    });

    it("should throw error for get without property", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "get" }],
        }),
      ).toThrow("get operation requires property");
    });

    it("should handle set operation", () => {
      defaultMock.set.mockReturnValueOnce(1);

      const result = liveApi({
        operations: [{ type: "set", property: "tempo", value: 130 }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe(1);
      expect(defaultMock.set).toHaveBeenCalledWith("tempo", 130);
    });

    it("should throw error for set without property", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "set", value: 130 }],
        }),
      ).toThrow("set operation requires property");
    });

    it("should throw error for set without value", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "set", property: "tempo" }],
        }),
      ).toThrow("set operation requires value");
    });

    it("should handle call operation", () => {
      const result = liveApi({
        operations: [{ type: "call", method: "get_current_beats_song_time" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe("001.01.01.000");
      expect(defaultMock.call).toHaveBeenCalledWith(
        "get_current_beats_song_time",
      );
    });

    it("should throw error for call without method", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "call" }],
        }),
      ).toThrow("call operation requires method");
    });

    it("should handle goto operation", () => {
      // Register mock for the goto target path
      registerMockObject("track-0", {
        path: livePath.track(0),
        type: "Track",
      });

      const result = liveApi({
        operations: [{ type: "goto", value: String(livePath.track(0)) }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe(1);
      expect(result.path).toBe(String(livePath.track(0)));
    });

    it("should throw error for goto without value", () => {
      expect(() =>
        liveApi({
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

      const result = liveApi({
        operations: [{ type: "info" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe(mockInfo);
    });
  });

  describe("extension shortcuts", () => {
    it("should handle get-property operation", () => {
      defaultMock.get.mockReturnValueOnce(["Test Track"]);

      const result = liveApi({
        operations: [{ type: "get-property", property: "name" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe("Test Track");
      expect(LiveAPI.prototype.getProperty).toHaveBeenCalledWith("name");
    });

    it("should throw error for getProperty without property", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "get-property" }],
        }),
      ).toThrow("get-property operation requires property");
    });

    it("should handle get-child-ids operation", () => {
      const result = liveApi({
        operations: [{ type: "get-child-ids", property: "clip_slots" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toStrictEqual([
        "id_clip_slots_1",
        "id_clip_slots_2",
      ]);
      expect(LiveAPI.prototype.getChildIds).toHaveBeenCalledWith("clip_slots");
    });

    it("should throw error for getChildIds without property", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "get-child-ids" }],
        }),
      ).toThrow("get-child-ids operation requires property (child type)");
    });

    it("should handle exists operation", () => {
      const result = liveApi({
        operations: [{ type: "exists" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe(true);
      expect(LiveAPI.prototype.exists).toHaveBeenCalled();
    });

    it("should handle get-color operation", () => {
      const result = liveApi({
        operations: [{ type: "get-color" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe("#FF0000");
      expect(LiveAPI.prototype.getColor).toHaveBeenCalled();
    });

    it("should handle set-color operation", () => {
      const result = liveApi({
        operations: [{ type: "set-color", value: "#00FF00" }],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toBe("#00FF00");
      expect(LiveAPI.prototype.setColor).toHaveBeenCalledWith("#00FF00");
    });

    it("should throw error for setColor without value", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "set-color" }],
        }),
      ).toThrow("set-color operation requires value (color)");
    });
  });

  describe("LiveAPI object operations", () => {
    it("should handle set-path operation", () => {
      registerMockObject("track-0", {
        path: livePath.track(0),
        type: "Track",
      });

      const result = liveApi({
        operations: [{ type: "set-path", value: String(livePath.track(0)) }],
      });

      // The result is a read-back of api.path, not an echo of the input.
      expect(result.results[0]).toBe(String(livePath.track(0)));
      expect(result.path).toBe(String(livePath.track(0)));
    });

    it("should handle set-path operation with an empty path", () => {
      // Clearing the path is the whole point of this operation: it is what
      // releases the path listeners Live installs. "" is falsy, so this only
      // works because the operation requires a defined value, not a truthy one.
      const result = liveApi({
        operations: [{ type: "set-path", value: "" }],
      });

      expect(result.results[0]).toBe("");
      expect(result.path).toBe("");
      // A cleared path reports id "0", the same as any path that doesn't
      // resolve, so the object reads as nonexistent. (This suite stubs
      // exists(); the e2e suite asserts it against real Live.)
      expect(result.id).toBe("0");
    });

    it("should throw error for set-path without value", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "set-path" }],
        }),
      ).toThrow("set-path operation requires value (path)");
    });

    it("should handle set-id operation", () => {
      registerMockObject("7", {
        path: livePath.track(0),
        type: "Track",
      });

      const result = liveApi({
        operations: [{ type: "set-id", value: 7 }],
      });

      // The result is a read-back of api.id, not an echo of the input: a bad id
      // is dropped silently and leaves the previous target in place.
      expect(result.results[0]).toBe("7");
      expect(result.path).toBe(String(livePath.track(0)));
    });

    it('should point at nothing for a set-id given the "id N" form', () => {
      // The bare number is the only form that retargets. Worth pinning down
      // because it fails the way everything else here does — silently.
      const result = liveApi({
        operations: [{ type: "set-id", value: "id 7" }],
      });

      expect(result.results[0]).toBe("0");
      expect(result.path).toBe("");
    });

    it("should throw error for set-id without value", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "set-id" }],
        }),
      ).toThrow("set-id operation requires value (id)");
    });

    it("should handle set-mode operation", () => {
      const result = liveApi({
        operations: [
          { type: "set-mode", value: 1 },
          { type: "get-field", property: "mode" },
        ],
      });

      expect(result.results[0]).toBe(1);
      expect(result.results[1]).toBe(1);
    });

    it("should handle set-mode operation with mode 0", () => {
      // 0 is falsy, so this only passes validation because set-mode requires a
      // defined value rather than a truthy one.
      const result = liveApi({
        operations: [{ type: "set-mode", value: 0 }],
      });

      expect(result.results[0]).toBe(0);
    });

    it("should throw error for set-mode without value", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "set-mode" }],
        }),
      ).toThrow("set-mode operation requires value (mode)");
    });

    it("should handle getcount operation", () => {
      const result = liveApi({
        operations: [{ type: "getcount", property: "tracks" }],
      });

      expect(result.results[0]).toBe(4);
      expect(LiveAPI.prototype.getcount).toHaveBeenCalledWith("tracks");
    });

    it("should throw error for getcount without property", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "getcount" }],
        }),
      ).toThrow("getcount operation requires property (child type)");
    });

    it("should handle getstring operation", () => {
      const result = liveApi({
        operations: [{ type: "getstring", property: "tempo" }],
      });

      expect(result.results[0]).toBe("<tempo>");
      expect(LiveAPI.prototype.getstring).toHaveBeenCalledWith("tempo");
    });

    it("should throw error for getstring without property", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "getstring" }],
        }),
      ).toThrow("getstring operation requires property");
    });
  });

  describe("path handling", () => {
    it("should create LiveAPI with path when provided", () => {
      const trackMock = registerMockObject("track-0", {
        path: livePath.track(0),
        type: "Track",
      });

      Object.defineProperty(LiveAPI.prototype, "info", {
        get: () => "Track info",
        configurable: true,
      });

      const result = liveApi({
        path: String(livePath.track(0)),
        operations: [{ type: "info" }],
      });

      expect(result.path).toBe(String(livePath.track(0)));
      expect(trackMock).toBeDefined();
    });

    it("should create LiveAPI without path when not provided", () => {
      const result = liveApi({
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

      const result = liveApi({
        operations: [
          { type: "get-field", property: "id" },
          { type: "get", property: "tempo" },
          { type: "info" },
        ],
      });

      expect(result.results).toHaveLength(3);
    });

    it("should return bare values without echoing the operations", () => {
      defaultMock.get.mockReturnValueOnce([120]);

      const result = liveApi({
        operations: [{ type: "get", property: "tempo" }],
      });

      expect(result.results).toStrictEqual([[120]]);
    });
  });

  describe("return format", () => {
    it("should return path, id, and results", () => {
      Object.defineProperty(LiveAPI.prototype, "info", {
        get: () => "Mock LiveAPI info",
        configurable: true,
      });

      const result = liveApi({
        path: livePath.liveSet,
        operations: [{ type: "info" }],
      });

      expect(result).toStrictEqual({
        path: livePath.liveSet,
        id: "1",
        results: ["Mock LiveAPI info"],
      });
    });
  });

  describe("error handling", () => {
    it("should throw error for unknown operation type", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "unknown_operation" }],
        } as unknown as Parameters<typeof liveApi>[0]),
      ).toThrow("Unknown operation type: unknown_operation");
    });

    it("should reject an inherited Object.prototype key as an operation type", () => {
      // A prototype-chain lookup would clear "toString" through the validator,
      // and the operations before it would already have run.
      expect(() =>
        liveApi({
          operations: [
            { type: "set", property: "tempo", value: 130 },
            { type: "toString" },
          ],
        } as unknown as Parameters<typeof liveApi>[0]),
      ).toThrow("Unknown operation type: toString");
      expect(defaultMock.set).not.toHaveBeenCalled();
    });

    it("should run nothing when a later operation is malformed", () => {
      expect(() =>
        liveApi({
          operations: [
            { type: "set", property: "tempo", value: 130 },
            { type: "set", property: "tempo" },
          ],
        }),
      ).toThrow(
        "operations[1] (counting from 0): set operation requires value",
      );
      expect(defaultMock.set).not.toHaveBeenCalled();
    });

    it("should name the position of an unknown type", () => {
      expect(() =>
        liveApi({
          operations: [{ type: "info" }, { type: "exists" }, { type: "nope" }],
        } as unknown as Parameters<typeof liveApi>[0]),
      ).toThrow(
        "operations[2] (counting from 0): Unknown operation type: nope",
      );
    });

    it("should wrap operation errors and preserve the original as cause", () => {
      let caught: unknown;

      try {
        liveApi({ operations: [{ type: "get-field" }] });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toContain("operations[0]");
      expect((caught as Error).cause).toBeInstanceOf(Error);
      expect(((caught as Error).cause as Error).message).toContain(
        "get-field operation requires property",
      );
    });
  });
});
