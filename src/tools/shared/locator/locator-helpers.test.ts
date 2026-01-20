import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  LiveAPI as MockLiveAPI,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.js";
import { getLocatorId, resolveLocatorToBeats } from "./locator-helpers.js";

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
      mockLiveApiGet({
        "id locator1": {
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
      mockLiveApiGet({
        "id locator1": {
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
      mockLiveApiGet({
        "id locator1": {
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
