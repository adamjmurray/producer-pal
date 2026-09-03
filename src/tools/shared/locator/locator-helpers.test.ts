// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveAPI as MockLiveAPI } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  findLocator,
  getLocatorId,
  isLocatorId,
  resolveLocatorListToBeats,
  resolveLocatorRefToBeats,
  resolveLocatorToBeats,
} from "./locator-helpers.ts";

// Make the mock LiveAPI globally available
// @ts-expect-error - assigning mock to global
global.LiveAPI = MockLiveAPI;

interface MockLocator {
  id: string;
  name?: string;
  time: number;
}

/**
 * Register mock locator objects and return a mock liveSet
 * @param locators - Locator configurations
 * @returns Mock liveSet with getChildIds returning the registered locator IDs
 */
function setupMockLocators(...locators: MockLocator[]): LiveAPI {
  for (const loc of locators) {
    registerMockObject(loc.id, {
      type: "CuePoint",
      properties: { name: loc.name, time: loc.time },
    });
  }

  return {
    getChildIds: vi.fn().mockReturnValue(locators.map((l) => `id ${l.id}`)),
  } as unknown as LiveAPI;
}

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

  describe("findLocator", () => {
    it("returns the match for a locator ID", () => {
      const liveSet = setupMockLocators(
        { id: "loc0", time: 0 },
        { id: "loc1", time: 16 },
      );

      expect(findLocator(liveSet, { locatorId: "locator-1" })?.index).toBe(1);
    });

    it("returns null for a locator ID that does not match", () => {
      const liveSet = setupMockLocators(
        { id: "loc0", time: 0 },
        { id: "loc1", time: 16 },
      );

      // An id guard mutated to always match would wrongly return index 0.
      expect(findLocator(liveSet, { locatorId: "locator-9" })).toBeNull();
    });

    it("finds a non-first locator by exact time", () => {
      const liveSet = setupMockLocators(
        { id: "loc0", time: 0 },
        { id: "loc1", time: 16 },
        { id: "loc2", time: 32 },
      );

      // Searching by time (no locatorId): the id branch must be skipped so the
      // match lands on index 2, not on the first locator.
      expect(findLocator(liveSet, { timeInBeats: 32 })?.index).toBe(2);
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

    it("appends the context suffix to the name-not-found message", () => {
      const liveSet = setupMockLocators({ id: "loc0", name: "Verse", time: 8 });

      // The " ${context}" suffix (leading space) must be preserved verbatim.
      expect(() => {
        resolveLocatorToBeats(
          liveSet,
          { locatorName: "Missing" },
          "ppal-playback",
          "for start",
        );
      }).toThrow(
        'ppal-playback failed: no locator found with name "Missing" for start',
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
      const liveSet = setupMockLocators({
        id: "loc0",
        name: "Verse",
        time: 8,
      });

      expect(
        resolveLocatorListToBeats(liveSet, { locatorName: "Verse" }, "dup"),
      ).toStrictEqual([8]);
    });

    it("resolves comma-separated locator names", () => {
      const liveSet = setupMockLocators(
        { id: "loc0", name: "Verse", time: 8 },
        { id: "loc1", name: "Chorus", time: 24 },
      );

      expect(
        resolveLocatorListToBeats(
          liveSet,
          { locatorName: "Verse, Chorus" },
          "dup",
        ),
      ).toStrictEqual([8, 24]);
    });

    it("throws when a locator ID is not found", () => {
      const liveSet = setupMockLocators({ id: "loc0", time: 0 });

      expect(() => {
        resolveLocatorListToBeats(
          liveSet,
          { locatorId: "locator-0, locator-5" },
          "duplicate",
        );
      }).toThrow("duplicate failed: locator not found: locator-5");
    });

    it("throws when a locator name is not found", () => {
      const liveSet = setupMockLocators({
        id: "loc0",
        name: "Verse",
        time: 8,
      });

      expect(() => {
        resolveLocatorListToBeats(
          liveSet,
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

  describe("isLocatorId", () => {
    it("returns true for valid locator IDs", () => {
      expect(isLocatorId("locator-0")).toBe(true);
      expect(isLocatorId("locator-42")).toBe(true);
      expect(isLocatorId("locator-99")).toBe(true);
    });

    it("returns false for locator names", () => {
      expect(isLocatorId("Verse")).toBe(false);
      expect(isLocatorId("Chorus")).toBe(false);
      expect(isLocatorId("locator-")).toBe(false);
      expect(isLocatorId("locator-abc")).toBe(false);
      expect(isLocatorId("LOCATOR-0")).toBe(false);
      // Anchored on both ends: reject leading/trailing junk around a valid core.
      expect(isLocatorId("xlocator-0")).toBe(false);
      expect(isLocatorId("locator-0x")).toBe(false);
    });
  });

  describe("resolveLocatorRefToBeats", () => {
    it("resolves by ID when value matches locator ID pattern", () => {
      const liveSet = setupMockLocators({ id: "locator1", time: 32 });

      expect(resolveLocatorRefToBeats(liveSet, "locator-0", "test-tool")).toBe(
        32,
      );
    });

    it("resolves by name when value does not match locator ID pattern", () => {
      const liveSet = setupMockLocators({
        id: "locator1",
        name: "Bridge",
        time: 64,
      });

      expect(resolveLocatorRefToBeats(liveSet, "Bridge", "test-tool")).toBe(64);
    });

    it("throws when locator not found", () => {
      const liveSet = setupMockLocators();

      expect(() => {
        resolveLocatorRefToBeats(liveSet, "locator-99", "test-tool");
      }).toThrow("test-tool failed: locator not found: locator-99");
    });
  });
});
