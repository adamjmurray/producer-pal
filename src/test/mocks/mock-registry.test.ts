// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/test/helpers/live-api-path-builders.ts";
import { LiveAPI, MockSequence } from "./mock-live-api.ts";
import {
  clearMockRegistry,
  lookupMockObject,
  registerMockObject,
} from "./mock-registry.ts";

describe("mock-registry", () => {
  describe("registerMockObject", () => {
    it("should return a mock with instance-level mocks", () => {
      const mock = registerMockObject("123", {
        path: livePath.track(0),
      });

      expect(mock.get).toBeTypeOf("function");
      expect(mock.set).toBeTypeOf("function");
      expect(mock.call).toBeTypeOf("function");
      expect(mock.id).toBe("123");
      expect(mock.path).toBe("live_set tracks 0");
      expect(mock.type).toBe("Track");
    });

    it("should normalize 'id X' prefix to bare ID", () => {
      const mock = registerMockObject("id 456", {
        path: livePath.scene(0),
      });

      expect(mock.id).toBe("456");
    });

    it("should auto-detect type from path", () => {
      const track = registerMockObject("1", { path: livePath.track(0) });
      const scene = registerMockObject("2", { path: livePath.scene(1) });
      const clipSlot = registerMockObject("3", {
        path: livePath.track(0).clipSlot(0),
      });
      const clip = registerMockObject("4", {
        path: livePath.track(0).clipSlot(0).clip(),
      });
      const arrClip = registerMockObject("5", {
        path: livePath.track(0).arrangementClip(1),
      });
      const liveSet = registerMockObject("6", { path: "live_set" });

      expect(track.type).toBe("Track");
      expect(scene.type).toBe("Scene");
      expect(clipSlot.type).toBe("ClipSlot");
      expect(clip.type).toBe("Clip");
      expect(arrClip.type).toBe("Clip");
      expect(liveSet.type).toBe("Song");
    });

    it("should use explicit type override when provided", () => {
      const mock = registerMockObject("1", {
        path: livePath.track(0),
        type: "ReturnTrack",
      });

      expect(mock.type).toBe("ReturnTrack");
    });

    it("should return 'Unknown' type when no path or type is provided", () => {
      const mock = registerMockObject("1");

      expect(mock.type).toBe("Unknown");
    });
  });

  describe("get mock", () => {
    it("should return configured properties", () => {
      const mock = registerMockObject("123", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1, name: "Test Clip" },
      });

      expect(mock.get("is_midi_clip")).toStrictEqual([1]);
      expect(mock.get("name")).toStrictEqual(["Test Clip"]);
    });

    it("should fall back to type-based defaults for unspecified properties", () => {
      const mock = registerMockObject("123", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { name: "Custom" },
      });

      // is_midi_clip is not in properties, should fall back to Clip default (1)
      expect(mock.get("is_midi_clip")).toStrictEqual([1]);
    });

    it("should return [0] for unknown properties with no type default", () => {
      const mock = registerMockObject("123", {
        path: livePath.track(0),
      });

      expect(mock.get("nonexistent_property")).toStrictEqual([0]);
    });

    it("should support MockSequence for sequential values", () => {
      const mock = registerMockObject("123", {
        path: livePath.track(0).clipSlot(0),
        properties: { has_clip: new MockSequence(0, 1) },
      });

      expect(mock.get("has_clip")).toStrictEqual([0]);
      expect(mock.get("has_clip")).toStrictEqual([1]);
    });

    it("should pass through array values unchanged", () => {
      const ids = ["id", "child1", "id", "child2"];
      const mock = registerMockObject("123", {
        path: "live_set",
        properties: { tracks: ids },
      });

      expect(mock.get("tracks")).toStrictEqual(ids);
    });

    it("should track calls for assertions", () => {
      const mock = registerMockObject("123", {
        path: livePath.track(0),
        properties: { name: "Track 1" },
      });

      mock.get("name");
      mock.get("color");

      expect(mock.get).toHaveBeenCalledTimes(2);
      expect(mock.get).toHaveBeenCalledWith("name");
      expect(mock.get).toHaveBeenCalledWith("color");
    });
  });

  describe("set mock", () => {
    it("should track set calls for assertions", () => {
      const mock = registerMockObject("123", {
        path: livePath.scene(0),
      });

      mock.set("name", "New Scene");
      mock.set("color", 16711680);

      expect(mock.set).toHaveBeenCalledTimes(2);
      expect(mock.set).toHaveBeenCalledWith("name", "New Scene");
      expect(mock.set).toHaveBeenCalledWith("color", 16711680);
    });
  });

  describe("call mock", () => {
    it("should dispatch to configured methods", () => {
      const mock = registerMockObject("123", {
        path: livePath.track(0).clipSlot(0).clip(),
        methods: {
          get_notes_extended: () => JSON.stringify({ notes: [{ pitch: 60 }] }),
        },
      });

      const result = mock.call("get_notes_extended", 0, 128, 0, 127);

      expect(result).toBe(JSON.stringify({ notes: [{ pitch: 60 }] }));
    });

    it("should fall back to defaults for unconfigured methods", () => {
      const mock = registerMockObject("123");

      expect(mock.call("get_version_string")).toBe("12.3");
      expect(mock.call("get_notes_extended")).toBe(
        JSON.stringify({ notes: [] }),
      );
      expect(mock.call("unknown_method")).toBeNull();
    });

    it("should track calls for assertions", () => {
      const mock = registerMockObject("123", {
        methods: {
          duplicate_clip_to_arrangement: () => ["id", "dup_1"],
        },
      });

      mock.call("duplicate_clip_to_arrangement", 4.0);

      expect(mock.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        4.0,
      );
    });
  });

  describe("lookupMockObject", () => {
    it("should find by ID", () => {
      const mock = registerMockObject("123", {
        path: livePath.track(0),
      });

      expect(lookupMockObject("123")).toBe(mock);
    });

    it("should find by path", () => {
      const mock = registerMockObject("123", {
        path: livePath.track(0),
      });

      expect(lookupMockObject(undefined, String(livePath.track(0)))).toBe(mock);
    });

    it("should prefer ID over path", () => {
      const track0 = registerMockObject("123", {
        path: livePath.track(0),
      });

      registerMockObject("456", {
        path: livePath.track(1),
      });

      // Lookup with ID "123" should find track0 even if path is for tracks 1
      expect(lookupMockObject("123", String(livePath.track(1)))).toBe(track0);
    });

    it("should return undefined for unregistered objects", () => {
      expect(lookupMockObject("999")).toBeUndefined();
      expect(
        lookupMockObject(undefined, String(livePath.track(99))),
      ).toBeUndefined();
    });
  });

  describe("clearMockRegistry", () => {
    it("should remove all registered objects", () => {
      registerMockObject("123", { path: livePath.track(0) });
      registerMockObject("456", { path: livePath.scene(0) });

      clearMockRegistry();

      expect(lookupMockObject("123")).toBeUndefined();
      expect(lookupMockObject("456")).toBeUndefined();
    });
  });

  describe("LiveAPI integration", () => {
    it("should use registered mocks on LiveAPI instances", () => {
      const mock = registerMockObject("123", {
        path: livePath.scene(0),
        properties: { name: "Scene 1" },
      });

      const api = LiveAPI.from("123");

      expect(api.get("name")).toStrictEqual(["Scene 1"]);
      expect(api.get).toBe(mock.get);
      expect(api.set).toBe(mock.set);
      expect(api.call).toBe(mock.call);
    });

    it("should return registered id/path/type from LiveAPI getters", () => {
      registerMockObject("123", {
        path: livePath.track(0),
      });

      const api = LiveAPI.from("123");

      expect(api.id).toBe("123");
      expect(api.path).toBe("live_set tracks 0");
      expect(api.type).toBe("Track");
    });

    it("should create inline mocks for non-registered objects", () => {
      // Don't register anything — object should get its own inline mocks
      const api = LiveAPI.from("999");

      expect(api.get).toBeTypeOf("function");
      expect(api.set).toBeTypeOf("function");
      expect(api.call).toBeTypeOf("function");

      // Each instance gets its own mock
      const api2 = LiveAPI.from("998");

      expect(api.get).not.toBe(api2.get);
    });

    it("should support set assertions without toHaveBeenCalledWithThis", () => {
      const mock = registerMockObject("123", {
        path: livePath.scene(0),
      });

      const api = LiveAPI.from("123");

      api.set("name", "Updated");

      // Direct assertion on instance mock — no context matching needed
      expect(mock.set).toHaveBeenCalledWith("name", "Updated");
    });

    it("should make extension properties work via path", () => {
      registerMockObject("123", {
        path: livePath.track(2),
      });

      const api = LiveAPI.from("123");

      expect(api.trackIndex).toBe(2);
    });

    it("should work with LiveAPI.from using path strings", () => {
      const mock = registerMockObject("t0", {
        path: livePath.track(0),
        properties: { name: "Track 0" },
      });

      // Construct via path instead of ID
      const api = LiveAPI.from(String(livePath.track(0)));

      expect(api.get("name")).toStrictEqual(["Track 0"]);
      expect(api.get).toBe(mock.get);
    });

    it("should be cleared between tests by beforeEach", () => {
      // Verify registry is empty at test start (cleared by test-setup.ts)
      expect(lookupMockObject("123")).toBeUndefined();
    });
  });
});
