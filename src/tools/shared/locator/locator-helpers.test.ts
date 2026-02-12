// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveAPI as MockLiveAPI } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { getLocatorId, resolveLocatorToBeats } from "./locator-helpers.ts";

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
});
