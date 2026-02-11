// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  LiveAPI,
  liveApiGet,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  MockSequence,
  setupStandardIdMock,
  type MockLiveAPIContext,
} from "./mock-live-api.ts";
import {
  clearMockRegistry,
  lookupMockObject,
  registerMockObject,
} from "./mock-registry.ts";

describe("mock-registry", () => {
  describe("registerMockObject", () => {
    it("should return a handle with instance-level mocks", () => {
      const handle = registerMockObject("123", {
        path: "live_set tracks 0",
      });

      expect(handle.get).toBeTypeOf("function");
      expect(handle.set).toBeTypeOf("function");
      expect(handle.call).toBeTypeOf("function");
      expect(handle.id).toBe("123");
      expect(handle.path).toBe("live_set tracks 0");
      expect(handle.type).toBe("Track");
    });

    it("should normalize 'id X' prefix to bare ID", () => {
      const handle = registerMockObject("id 456", {
        path: "live_set scenes 0",
      });

      expect(handle.id).toBe("456");
    });

    it("should auto-detect type from path", () => {
      const track = registerMockObject("1", { path: "live_set tracks 0" });
      const scene = registerMockObject("2", { path: "live_set scenes 1" });
      const clipSlot = registerMockObject("3", {
        path: "live_set tracks 0 clip_slots 0",
      });
      const clip = registerMockObject("4", {
        path: "live_set tracks 0 clip_slots 0 clip",
      });
      const arrClip = registerMockObject("5", {
        path: "live_set tracks 0 arrangement_clips 1",
      });
      const liveSet = registerMockObject("6", { path: "live_set" });

      expect(track.type).toBe("Track");
      expect(scene.type).toBe("Scene");
      expect(clipSlot.type).toBe("ClipSlot");
      expect(clip.type).toBe("Clip");
      expect(arrClip.type).toBe("Clip");
      expect(liveSet.type).toBe("LiveSet");
    });

    it("should use explicit type override when provided", () => {
      const handle = registerMockObject("1", {
        path: "live_set tracks 0",
        type: "ReturnTrack",
      });

      expect(handle.type).toBe("ReturnTrack");
    });

    it("should return 'Unknown' type when no path or type is provided", () => {
      const handle = registerMockObject("1");

      expect(handle.type).toBe("Unknown");
    });
  });

  describe("get mock", () => {
    it("should return configured properties", () => {
      const handle = registerMockObject("123", {
        path: "live_set tracks 0 clip_slots 0 clip",
        properties: { is_midi_clip: 1, name: "Test Clip" },
      });

      expect(handle.get("is_midi_clip")).toStrictEqual([1]);
      expect(handle.get("name")).toStrictEqual(["Test Clip"]);
    });

    it("should fall back to type-based defaults for unspecified properties", () => {
      const handle = registerMockObject("123", {
        path: "live_set tracks 0 clip_slots 0 clip",
        properties: { name: "Custom" },
      });

      // is_midi_clip is not in properties, should fall back to Clip default (1)
      expect(handle.get("is_midi_clip")).toStrictEqual([1]);
    });

    it("should return [0] for unknown properties with no type default", () => {
      const handle = registerMockObject("123", {
        path: "live_set tracks 0",
      });

      expect(handle.get("nonexistent_property")).toStrictEqual([0]);
    });

    it("should support MockSequence for sequential values", () => {
      const handle = registerMockObject("123", {
        path: "live_set tracks 0 clip_slots 0",
        properties: { has_clip: new MockSequence(0, 1) },
      });

      expect(handle.get("has_clip")).toStrictEqual([0]);
      expect(handle.get("has_clip")).toStrictEqual([1]);
    });

    it("should pass through array values unchanged", () => {
      const ids = ["id", "child1", "id", "child2"];
      const handle = registerMockObject("123", {
        path: "live_set",
        properties: { tracks: ids },
      });

      expect(handle.get("tracks")).toStrictEqual(ids);
    });

    it("should track calls for assertions", () => {
      const handle = registerMockObject("123", {
        path: "live_set tracks 0",
        properties: { name: "Track 1" },
      });

      handle.get("name");
      handle.get("color");

      expect(handle.get).toHaveBeenCalledTimes(2);
      expect(handle.get).toHaveBeenCalledWith("name");
      expect(handle.get).toHaveBeenCalledWith("color");
    });
  });

  describe("set mock", () => {
    it("should track set calls for assertions", () => {
      const handle = registerMockObject("123", {
        path: "live_set scenes 0",
      });

      handle.set("name", "New Scene");
      handle.set("color", 16711680);

      expect(handle.set).toHaveBeenCalledTimes(2);
      expect(handle.set).toHaveBeenCalledWith("name", "New Scene");
      expect(handle.set).toHaveBeenCalledWith("color", 16711680);
    });
  });

  describe("call mock", () => {
    it("should dispatch to configured methods", () => {
      const handle = registerMockObject("123", {
        path: "live_set tracks 0 clip_slots 0 clip",
        methods: {
          get_notes_extended: () => JSON.stringify({ notes: [{ pitch: 60 }] }),
        },
      });

      const result = handle.call("get_notes_extended", 0, 128, 0, 127);

      expect(result).toBe(JSON.stringify({ notes: [{ pitch: 60 }] }));
    });

    it("should fall back to defaults for unconfigured methods", () => {
      const handle = registerMockObject("123");

      expect(handle.call("get_version_string")).toBe("12.3");
      expect(handle.call("get_notes_extended")).toBe(
        JSON.stringify({ notes: [] }),
      );
      expect(handle.call("unknown_method")).toBeNull();
    });

    it("should track calls for assertions", () => {
      const handle = registerMockObject("123", {
        methods: {
          duplicate_clip_to_arrangement: () => ["id", "dup_1"],
        },
      });

      handle.call("duplicate_clip_to_arrangement", 4.0);

      expect(handle.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        4.0,
      );
    });
  });

  describe("lookupMockObject", () => {
    it("should find by ID", () => {
      const handle = registerMockObject("123", {
        path: "live_set tracks 0",
      });

      expect(lookupMockObject("123")).toBe(handle);
    });

    it("should find by path", () => {
      const handle = registerMockObject("123", {
        path: "live_set tracks 0",
      });

      expect(lookupMockObject(undefined, "live_set tracks 0")).toBe(handle);
    });

    it("should prefer ID over path", () => {
      const handle1 = registerMockObject("123", {
        path: "live_set tracks 0",
      });

      registerMockObject("456", {
        path: "live_set tracks 1",
      });

      // Lookup with ID "123" should find handle1 even if path is for handle2
      expect(lookupMockObject("123", "live_set tracks 1")).toBe(handle1);
    });

    it("should return undefined for unregistered objects", () => {
      expect(lookupMockObject("999")).toBeUndefined();
      expect(lookupMockObject(undefined, "live_set tracks 99")).toBeUndefined();
    });
  });

  describe("clearMockRegistry", () => {
    it("should remove all registered objects", () => {
      registerMockObject("123", { path: "live_set tracks 0" });
      registerMockObject("456", { path: "live_set scenes 0" });

      clearMockRegistry();

      expect(lookupMockObject("123")).toBeUndefined();
      expect(lookupMockObject("456")).toBeUndefined();
    });
  });

  describe("LiveAPI integration", () => {
    it("should use registered mocks on LiveAPI instances", () => {
      const handle = registerMockObject("123", {
        path: "live_set scenes 0",
        properties: { name: "Scene 1" },
      });

      const api = LiveAPI.from("123");

      expect(api.get("name")).toStrictEqual(["Scene 1"]);
      expect(api.get).toBe(handle.get);
      expect(api.set).toBe(handle.set);
      expect(api.call).toBe(handle.call);
    });

    it("should return registered id/path/type from LiveAPI getters", () => {
      registerMockObject("123", {
        path: "live_set tracks 0",
      });

      const api = LiveAPI.from("123");

      expect(api.id).toBe("123");
      expect(api.path).toBe("live_set tracks 0");
      expect(api.type).toBe("Track");
    });

    it("should use shared mocks for non-registered objects", () => {
      // Don't register anything — object should use shared mocks
      const api = LiveAPI.from("999");

      expect(api.get).toBe(liveApiGet);
      expect(api.set).toBe(liveApiSet);
    });

    it("should coexist with shared mock system in the same test", () => {
      // Register one object with registry
      const registeredHandle = registerMockObject("123", {
        path: "live_set scenes 0",
        properties: { name: "Registered Scene" },
      });

      // Configure a different object with the old shared mock system
      setupStandardIdMock();
      liveApiPath.mockImplementation(function (this: MockLiveAPIContext) {
        if (this._id === "456") return "live_set scenes 1";

        return this._path;
      });
      mockLiveApiGet({ "456": { name: "Shared Scene" } });

      // Registered object uses instance mocks
      const api1 = LiveAPI.from("123");

      expect(api1.get("name")).toStrictEqual(["Registered Scene"]);
      expect(api1.get).toBe(registeredHandle.get);

      // Non-registered object uses shared mocks
      const api2 = LiveAPI.from("456");

      expect(api2.get("name")).toStrictEqual(["Shared Scene"]);
      expect(api2.get).toBe(liveApiGet);
    });

    it("should support set assertions without toHaveBeenCalledWithThis", () => {
      const handle = registerMockObject("123", {
        path: "live_set scenes 0",
      });

      const api = LiveAPI.from("123");

      api.set("name", "Updated");

      // Direct assertion on instance mock — no context matching needed
      expect(handle.set).toHaveBeenCalledWith("name", "Updated");
    });

    it("should make extension properties work via path", () => {
      registerMockObject("123", {
        path: "live_set tracks 2",
      });

      const api = LiveAPI.from("123");

      expect(api.trackIndex).toBe(2);
    });

    it("should work with LiveAPI.from using path strings", () => {
      const handle = registerMockObject("t0", {
        path: "live_set tracks 0",
        properties: { name: "Track 0" },
      });

      // Construct via path instead of ID
      const api = LiveAPI.from("live_set tracks 0");

      expect(api.get("name")).toStrictEqual(["Track 0"]);
      expect(api.get).toBe(handle.get);
    });

    it("should be cleared between tests by beforeEach", () => {
      // Verify registry is empty at test start (cleared by test-setup.ts)
      expect(lookupMockObject("123")).toBeUndefined();
    });
  });
});
