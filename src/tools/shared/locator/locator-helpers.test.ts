// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveAPI as MockLiveAPI } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  getLocatorId,
  resolveLocatorListToBeats,
  resolveLocatorToBeats,
} from "./locator-helpers.ts";

// Make the mock LiveAPI globally available
// @ts-expect-error - assigning mock to global
global.LiveAPI = MockLiveAPI;

describe("locator-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getLocatorId", () => {
    it("returns locator ID in expected format", () => {
      expect(getLocatorId(0)).toBe("locator-0");
      expect(getLocatorId(5)).toBe("locator-5");
      expect(getLocatorId(99)).toBe("locator-99");
    });
  });

  describe("resolveLocatorToBeats", () => {
    it("throws when neither locatorId nor locatorName provided", () => {
      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue([]),
      } as unknown as LiveAPI;

      expect(() => {
        resolveLocatorToBeats(mockLiveSet, {}, "ppal-playback");
      }).toThrow("ppal-playback failed: locatorId or locatorName is required");
    });

    it("throws when locator ID not found", () => {
      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue([]),
      } as unknown as LiveAPI;

      expect(() => {
        resolveLocatorToBeats(
          mockLiveSet,
          { locatorId: "locator-5" },
          "ppal-playback",
        );
      }).toThrow("ppal-playback failed: locator not found: locator-5");
    });

    it("resolves locator by ID", () => {
      registerMockObject("locator1", {
        type: "CuePoint",
        properties: {
          time: 32,
        },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id locator1"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorToBeats(
        mockLiveSet,
        { locatorId: "locator-0" },
        "ppal-playback",
      );

      expect(result).toBe(32);
    });

    it("resolves locator by name", () => {
      registerMockObject("locator1", {
        type: "CuePoint",
        properties: {
          name: "Bridge",
          time: 64,
        },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id locator1"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorToBeats(
        mockLiveSet,
        { locatorName: "Bridge" },
        "ppal-playback",
      );

      expect(result).toBe(64);
    });

    it("throws when locator name not found", () => {
      registerMockObject("locator1", {
        type: "CuePoint",
        properties: {
          name: "Verse",
          time: 16,
        },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id locator1"]),
      } as unknown as LiveAPI;

      expect(() => {
        resolveLocatorToBeats(
          mockLiveSet,
          { locatorName: "NonExistent" },
          "ppal-playback",
        );
      }).toThrow(
        'ppal-playback failed: no locator found with name "NonExistent"',
      );
    });
  });

  describe("resolveLocatorListToBeats", () => {
    it("resolves single locator ID", () => {
      registerMockObject("locator1", {
        type: "CuePoint",
        properties: { time: 16 },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id locator1"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorListToBeats(
        mockLiveSet,
        { locatorId: "locator-0" },
        "duplicate",
      );

      expect(result).toStrictEqual([16]);
    });

    it("resolves comma-separated locator IDs", () => {
      registerMockObject("loc0", {
        type: "CuePoint",
        properties: { time: 0 },
      });
      registerMockObject("loc1", {
        type: "CuePoint",
        properties: { time: 16 },
      });
      registerMockObject("loc2", {
        type: "CuePoint",
        properties: { time: 32 },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id loc0", "id loc1", "id loc2"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorListToBeats(
        mockLiveSet,
        { locatorId: "locator-0, locator-2" },
        "duplicate",
      );

      expect(result).toStrictEqual([0, 32]);
    });

    it("resolves single locator name", () => {
      registerMockObject("loc0", {
        type: "CuePoint",
        properties: { name: "Verse", time: 8 },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id loc0"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorListToBeats(
        mockLiveSet,
        { locatorName: "Verse" },
        "duplicate",
      );

      expect(result).toStrictEqual([8]);
    });

    it("resolves comma-separated locator names", () => {
      registerMockObject("loc0", {
        type: "CuePoint",
        properties: { name: "Verse", time: 8 },
      });
      registerMockObject("loc1", {
        type: "CuePoint",
        properties: { name: "Chorus", time: 24 },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id loc0", "id loc1"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorListToBeats(
        mockLiveSet,
        { locatorName: "Verse, Chorus" },
        "duplicate",
      );

      expect(result).toStrictEqual([8, 24]);
    });

    it("throws when a locator ID is not found", () => {
      registerMockObject("loc0", {
        type: "CuePoint",
        properties: { time: 0 },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id loc0"]),
      } as unknown as LiveAPI;

      expect(() => {
        resolveLocatorListToBeats(
          mockLiveSet,
          { locatorId: "locator-0, locator-5" },
          "duplicate",
        );
      }).toThrow("duplicate failed: locator not found: locator-5");
    });

    it("throws when a locator name is not found", () => {
      registerMockObject("loc0", {
        type: "CuePoint",
        properties: { name: "Verse", time: 8 },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id loc0"]),
      } as unknown as LiveAPI;

      expect(() => {
        resolveLocatorListToBeats(
          mockLiveSet,
          { locatorName: "Verse, NonExistent" },
          "duplicate",
        );
      }).toThrow('duplicate failed: no locator found with name "NonExistent"');
    });

    it("throws when neither locatorId nor locatorName provided", () => {
      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue([]),
      } as unknown as LiveAPI;

      expect(() => {
        resolveLocatorListToBeats(mockLiveSet, {}, "duplicate");
      }).toThrow("duplicate failed: locatorId or locatorName is required");
    });
  });
});
