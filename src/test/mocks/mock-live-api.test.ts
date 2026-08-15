// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/* eslint-disable no-restricted-syntax -- Infrastructure tests need direct constructor access */

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  lookupMockObject,
  registerMockObject,
} from "./mock-registry.ts";
import { LiveAPI } from "./mock-live-api.ts";

describe("Mock LiveAPI Infrastructure", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  describe("returnPath feature", () => {
    it("returns returnPath from .path getter when set", () => {
      registerMockObject("test-obj", {
        path: "live_set view selected_track",
        type: "Track",
        returnPath: String(livePath.track(3)),
      });

      const api = new LiveAPI("live_set view selected_track");

      expect(api.path).toBe("live_set tracks 3");
    });

    it("returns registered path from .path getter when returnPath is undefined", () => {
      registerMockObject("test-obj", {
        path: livePath.track(0),
        type: "Track",
      });

      const api = new LiveAPI(String(livePath.track(0)));

      expect(api.path).toBe("live_set tracks 0");
    });

    it("stores registered path in registry for lookup even with returnPath set", () => {
      registerMockObject("test-obj", {
        path: "live_set view selected_track",
        type: "Track",
        returnPath: String(livePath.track(3)),
      });

      const registered = lookupMockObject(
        undefined,
        "live_set view selected_track",
      );

      expect(registered).toBeDefined();
      expect(registered!.path).toBe("live_set view selected_track");
      expect(registered!.returnPath).toBe("live_set tracks 3");
    });
  });

  describe("property copying", () => {
    it("copies registered properties onto LiveAPI instances", () => {
      registerMockObject("test-track", {
        path: livePath.track(2),
        type: "Track",
        properties: {
          category: "regular",
          trackIndex: 2,
          customProp: "test-value",
        },
      });

      const api = new LiveAPI(String(livePath.track(2)));

      expect(api.category).toBe("regular");
      expect(api.trackIndex).toBe(2);
      expect((api as unknown as Record<string, unknown>).customProp).toBe(
        "test-value",
      );
    });

    it("does not override core getters (id, path, type)", () => {
      registerMockObject("123", {
        path: livePath.track(0),
        type: "Track",
        properties: {
          id: "should-be-ignored",
          path: "should-be-ignored",
          type: "should-be-ignored",
        },
      });

      const api = new LiveAPI(String(livePath.track(0)));

      // Core getters should use LiveAPI logic, not properties
      // Registry stores bare IDs (without "id " prefix)
      expect(api.id).toBe("123");
      expect(api.path).toBe("live_set tracks 0");
      expect(api.type).toBe("Track");
    });

    it("handles undefined properties gracefully", () => {
      registerMockObject("test-obj", {
        path: "live_set",
        type: "Song",
        // No properties field
      });

      const api = new LiveAPI("live_set");

      // Should not throw, just have no additional properties
      expect(api.type).toBe("Song");
    });
  });

  describe("instance-level mocks", () => {
    it("uses instance-level get mock from registry", () => {
      const mock = registerMockObject("test-track", {
        path: livePath.track(0),
        type: "Track",
      });

      mock.get.mockReturnValueOnce(["Test Track"]);

      const api = new LiveAPI(String(livePath.track(0)));
      const result = api.get("name");

      expect(result).toStrictEqual(["Test Track"]);
      expect(mock.get).toHaveBeenCalledWith("name");
    });

    it("uses instance-level set mock from registry", () => {
      const mock = registerMockObject("test-track", {
        path: livePath.track(0),
        type: "Track",
      });

      mock.set.mockReturnValueOnce(1);

      const api = new LiveAPI(String(livePath.track(0)));
      const result = api.set("name", "New Name");

      expect(result).toBe(1);
      expect(mock.set).toHaveBeenCalledWith("name", "New Name");
    });

    it("uses instance-level call mock from registry", () => {
      const mock = registerMockObject("test-track", {
        path: livePath.track(0),
        type: "Track",
        methods: {
          duplicate_clip_to: () => 1,
        },
      });

      const api = new LiveAPI(String(livePath.track(0)));
      const result = api.call("duplicate_clip_to", 1, 2);

      expect(result).toBe(1);
      expect(mock.call).toHaveBeenCalledWith("duplicate_clip_to", 1, 2);
    });
  });

  // A retargeted object has to land where a fresh one at that path would. Only
  // the constructor used to bind get/set/call and copy the registered
  // properties, so retargeting left both pointing at the previous target.
  describe("retargeting", () => {
    it("rebinds get, set, and call to the new target", () => {
      const first = registerMockObject("track-0", {
        path: livePath.track(0),
        type: "Track",
      });
      const second = registerMockObject("track-1", {
        path: livePath.track(1),
        type: "Track",
      });

      const api = new LiveAPI(String(livePath.track(0)));

      api.goto(String(livePath.track(1)));
      api.get("name");
      api.set("name", "New Name");
      api.call("duplicate_clip_to");

      expect(second.get).toHaveBeenCalledWith("name");
      expect(second.set).toHaveBeenCalledWith("name", "New Name");
      expect(second.call).toHaveBeenCalledWith("duplicate_clip_to");
      expect(first.get).not.toHaveBeenCalled();
      expect(first.set).not.toHaveBeenCalled();
      expect(first.call).not.toHaveBeenCalled();
    });

    it("drops a property the new target doesn't define", () => {
      registerMockObject("track-0", {
        path: livePath.track(0),
        type: "Track",
        properties: { customProp: "first" },
      });
      registerMockObject("track-1", {
        path: livePath.track(1),
        type: "Track",
      });

      const api = new LiveAPI(String(livePath.track(0)));

      api.goto(String(livePath.track(1)));

      expect(
        (api as unknown as Record<string, unknown>).customProp,
      ).toBeUndefined();
    });

    it("replaces a property both targets define", () => {
      registerMockObject("track-0", {
        path: livePath.track(0),
        type: "Track",
        properties: { trackIndex: 0 },
      });
      registerMockObject("track-1", {
        path: livePath.track(1),
        type: "Track",
        properties: { trackIndex: 1 },
      });

      const api = new LiveAPI(String(livePath.track(0)));

      api.goto(String(livePath.track(1)));

      expect(api.trackIndex).toBe(1);
    });

    it("falls back to the default mocks when retargeted off the registry", () => {
      const mock = registerMockObject("track-0", {
        path: livePath.track(0),
        type: "Track",
      });

      const api = new LiveAPI(String(livePath.track(0)));

      api.goto(String(livePath.track(9)));
      api.get("name");

      expect(api.mock).toBeUndefined();
      expect(mock.get).not.toHaveBeenCalled();
    });

    it("retargets through a path write the same way as through goto", () => {
      const second = registerMockObject("track-1", {
        path: livePath.track(1),
        type: "Track",
        properties: { trackIndex: 1 },
      });

      const api = new LiveAPI(String(livePath.track(0)));

      api.path = String(livePath.track(1));
      api.get("name");

      expect(second.get).toHaveBeenCalledWith("name");
      expect(api.trackIndex).toBe(1);
    });
  });
});
