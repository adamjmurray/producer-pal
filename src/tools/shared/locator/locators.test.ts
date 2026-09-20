// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveAPI as MockLiveAPI } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  findLocator,
  isLocatorId,
  resolveLocatorListToBeats,
  resolveLocatorRefToBeats,
  resolveLocatorToBeats,
} from "./locators.ts";

// Make the mock LiveAPI globally available
// @ts-expect-error - assigning mock to global
global.LiveAPI = MockLiveAPI;

interface MockLocator {
  id: string;
  // number simulates Live returning an all-digit name as a number, not a string
  name?: string | number;
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

describe("locators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findLocator", () => {
    it("returns the match for a locator ID", () => {
      const liveSet = setupMockLocators(
        { id: "26", time: 0 },
        { id: "27", time: 16 },
      );

      expect(findLocator(liveSet, { locatorId: "27" })?.index).toBe(1);
    });

    it("returns null for a locator ID that does not match", () => {
      const liveSet = setupMockLocators(
        { id: "26", time: 0 },
        { id: "27", time: 16 },
      );

      // An id guard mutated to always match would wrongly return index 0.
      expect(findLocator(liveSet, { locatorId: "99" })).toBeNull();
    });

    it("finds a non-first locator by exact time", () => {
      const liveSet = setupMockLocators(
        { id: "26", time: 0 },
        { id: "27", time: 16 },
        { id: "28", time: 32 },
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
        resolveLocatorToBeats(mockLiveSet, {});
      }).toThrow("locatorId or locatorName is required");
    });

    it("throws when locator ID not found", () => {
      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue([]),
      } as unknown as LiveAPI;

      expect(() => {
        resolveLocatorToBeats(mockLiveSet, { locatorId: "99" });
      }).toThrow("locator not found: 99");
    });

    it("resolves locator by ID", () => {
      registerMockObject("27", {
        type: "CuePoint",
        properties: {
          time: 32,
        },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id 27"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorToBeats(mockLiveSet, {
        locatorId: "27",
      });

      expect(result).toBe(32);
    });

    it("resolves locator by name", () => {
      registerMockObject("27", {
        type: "CuePoint",
        properties: {
          name: "Bridge",
          time: 64,
        },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id 27"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorToBeats(mockLiveSet, {
        locatorName: "Bridge",
      });

      expect(result).toBe(64);
    });

    it("throws when locator name not found", () => {
      registerMockObject("27", {
        type: "CuePoint",
        properties: {
          name: "Verse",
          time: 16,
        },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id 27"]),
      } as unknown as LiveAPI;

      expect(() => {
        resolveLocatorToBeats(mockLiveSet, { locatorName: "NonExistent" });
      }).toThrow('no locator found with name "NonExistent"');
    });

    it("resolves locator by name when Live reports an all-digit name as a number", () => {
      const liveSet = setupMockLocators({ id: "26", name: 5678, time: 8 });

      const result = resolveLocatorToBeats(liveSet, { locatorName: "5678" });

      expect(result).toBe(8);
    });

    it("never matches an empty locatorName, even against a nameless locator", () => {
      // A nameless locator reads back "" (getName's fallback for a missing
      // name), so without an explicit guard an empty locatorName would match
      // every nameless locator — and delete-by-name would wipe them all.
      const liveSet = setupMockLocators({ id: "26", time: 8 });

      expect(() => {
        resolveLocatorToBeats(liveSet, { locatorName: "" });
      }).toThrow('no locator found with name ""');
    });

    it("appends the context suffix to the name-not-found message", () => {
      const liveSet = setupMockLocators({ id: "26", name: "Verse", time: 8 });

      // The " ${context}" suffix (leading space) must be preserved verbatim.
      expect(() => {
        resolveLocatorToBeats(liveSet, { locatorName: "Missing" }, "for start");
      }).toThrow('no locator found with name "Missing" for start');
    });
  });

  describe("resolveLocatorListToBeats", () => {
    it("resolves single locator ID", () => {
      registerMockObject("27", {
        type: "CuePoint",
        properties: { time: 16 },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id 27"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorListToBeats(mockLiveSet, {
        locatorId: "27",
      });

      expect(result).toStrictEqual([16]);
    });

    it("resolves comma-separated locator IDs", () => {
      registerMockObject("26", {
        type: "CuePoint",
        properties: { time: 0 },
      });
      registerMockObject("27", {
        type: "CuePoint",
        properties: { time: 16 },
      });
      registerMockObject("28", {
        type: "CuePoint",
        properties: { time: 32 },
      });

      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue(["id 26", "id 27", "id 28"]),
      } as unknown as LiveAPI;

      const result = resolveLocatorListToBeats(mockLiveSet, {
        locatorId: "26, 28",
      });

      expect(result).toStrictEqual([0, 32]);
    });

    it("resolves single locator name", () => {
      const liveSet = setupMockLocators({
        id: "26",
        name: "Verse",
        time: 8,
      });

      expect(
        resolveLocatorListToBeats(liveSet, { locatorName: "Verse" }),
      ).toStrictEqual([8]);
    });

    it("resolves comma-separated locator names", () => {
      const liveSet = setupMockLocators(
        { id: "26", name: "Verse", time: 8 },
        { id: "27", name: "Chorus", time: 24 },
      );

      expect(
        resolveLocatorListToBeats(liveSet, { locatorName: "Verse, Chorus" }),
      ).toStrictEqual([8, 24]);
    });

    it("throws when a locator ID is not found", () => {
      const liveSet = setupMockLocators({ id: "26", time: 0 });

      expect(() => {
        resolveLocatorListToBeats(liveSet, {
          locatorId: "26, 99",
        });
      }).toThrow("locator not found: 99");
    });

    it("throws when a locator name is not found", () => {
      const liveSet = setupMockLocators({
        id: "26",
        name: "Verse",
        time: 8,
      });

      expect(() => {
        resolveLocatorListToBeats(liveSet, {
          locatorName: "Verse, NonExistent",
        });
      }).toThrow('no locator found with name "NonExistent"');
    });

    it("throws when neither locatorId nor locatorName provided", () => {
      const mockLiveSet = {
        getChildIds: vi.fn().mockReturnValue([]),
      } as unknown as LiveAPI;

      expect(() => {
        resolveLocatorListToBeats(mockLiveSet, {});
      }).toThrow("locatorId or locatorName is required");
    });
  });

  describe("isLocatorId", () => {
    it("returns true for an all-digit id", () => {
      expect(isLocatorId("0")).toBe(true);
      expect(isLocatorId("27")).toBe(true);
      expect(isLocatorId("12345")).toBe(true);
    });

    it("returns false for locator names", () => {
      expect(isLocatorId("Verse")).toBe(false);
      expect(isLocatorId("Chorus")).toBe(false);
      expect(isLocatorId("")).toBe(false);
      expect(isLocatorId("27b")).toBe(false);
      // Anchored on both ends: reject leading/trailing junk around a valid core.
      expect(isLocatorId("id 27")).toBe(false);
      expect(isLocatorId("27 ")).toBe(false);
    });
  });

  describe("resolveLocatorRefToBeats", () => {
    it("resolves by ID when value is all digits", () => {
      const liveSet = setupMockLocators({ id: "27", time: 32 });

      expect(resolveLocatorRefToBeats(liveSet, "27")).toBe(32);
    });

    it("resolves by name when value is not all digits", () => {
      const liveSet = setupMockLocators({
        id: "27",
        name: "Bridge",
        time: 64,
      });

      expect(resolveLocatorRefToBeats(liveSet, "Bridge")).toBe(64);
    });

    it("throws when locator not found", () => {
      const liveSet = setupMockLocators();

      expect(() => {
        resolveLocatorRefToBeats(liveSet, "99");
      }).toThrow("locator not found: 99");
    });
  });
});
