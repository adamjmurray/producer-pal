// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveAPI as MockLiveAPI } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  findLocator,
  isLocatorId,
  readLocators,
  resolveLocatorRefToBeats,
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

    it("throws when a name matches no locator, with the context", () => {
      const liveSet = setupMockLocators({ id: "26", name: "Verse", time: 8 });

      expect(() => {
        resolveLocatorRefToBeats(liveSet, "Missing", "for start");
      }).toThrow('no locator found with name "Missing" for start');
    });

    it("resolves a name when Live reports an all-digit name as a number", () => {
      const liveSet = setupMockLocators({ id: "26", name: 5678, time: 8 });

      expect(resolveLocatorRefToBeats(liveSet, "5678")).toBe(8);
    });

    it("never matches an empty ref, even against a nameless locator", () => {
      // A nameless locator reads back "", so an empty ref would otherwise match
      // every nameless locator.
      const liveSet = setupMockLocators({ id: "26", time: 8 });

      expect(() => {
        resolveLocatorRefToBeats(liveSet, "");
      }).toThrow('no locator found with name ""');
    });

    it("throws when locator not found", () => {
      const liveSet = setupMockLocators();

      expect(() => {
        resolveLocatorRefToBeats(liveSet, "99");
      }).toThrow("locator not found: 99");
    });

    it("resolves an all-digit name when no locator has that id", () => {
      const liveSet = setupMockLocators(
        { id: "26", name: "1", time: 0 },
        { id: "27", name: "2", time: 16 },
      );

      expect(resolveLocatorRefToBeats(liveSet, "2")).toBe(16);
    });

    it("resolves a locator whose id and name are the same", () => {
      const liveSet = setupMockLocators({ id: "26", name: "26", time: 8 });

      expect(resolveLocatorRefToBeats(liveSet, "26")).toBe(8);
    });

    it("resolves by id over another locator's name", () => {
      const liveSet = setupMockLocators(
        { id: "26", name: "Verse", time: 0 },
        { id: "31", name: "26", time: 64 },
      );

      expect(resolveLocatorRefToBeats(liveSet, "26")).toBe(0);
    });

    it("names the param when an all-digit ref names nothing", () => {
      const liveSet = setupMockLocators({ id: "26", name: "Verse", time: 0 });

      expect(() => {
        resolveLocatorRefToBeats(liveSet, "99", "for startTime");
      }).toThrow("locator not found: 99 for startTime");
    });

    it.each<[string, MockLocator[]]>([
      [
        "ids and all-digit names crossed",
        [
          { id: "24", name: "25", time: 0 },
          { id: "25", name: "Verse", time: 8 },
          { id: "26", name: "24", time: 16 },
        ],
      ],
      [
        "ids and names swapped",
        [
          { id: "27", name: "31", time: 4 },
          { id: "31", name: "27", time: 12 },
        ],
      ],
      [
        "a blank name whose id is another's name",
        [
          { id: "40", name: "", time: 20 },
          { id: "41", name: "40", time: 28 },
        ],
      ],
    ])("round-trips every read position with %s", (_label, locators) => {
      const liveSet = setupMockLocators(...locators);

      for (const [i, { position }] of readLocators(liveSet, 4, 4).entries()) {
        const ref = position.replace(/^loc:/, "");

        expect(resolveLocatorRefToBeats(liveSet, ref)).toBe(locators[i]?.time);
      }
    });
  });
});
