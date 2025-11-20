import { describe, expect, it } from "vitest";
import {
  parseArrangementLength,
  findRoutingOptionForDuplicateNames,
} from "./duplicate-helpers.js";

/**
 * Helper to create a mock LiveAPI class for testing duplicate routing scenarios
 * @param {Array<string>} trackIds - Array of track IDs
 * @param {object} trackNameMapping - Mapping of track paths to names
 * @returns {class} - Mock LiveAPI class
 */
function createMockLiveAPI(trackIds, trackNameMapping) {
  return class {
    constructor(path) {
      this.path = path;
      if (path === "live_set") {
        this._isLiveSet = true;
      }
    }

    getChildIds(property) {
      if (this._isLiveSet && property === "tracks") {
        return trackIds;
      }
      return [];
    }

    getProperty(prop) {
      if (prop === "name" && trackNameMapping[this.path]) {
        return trackNameMapping[this.path];
      }
      return null;
    }

    get id() {
      return this.path;
    }
  };
}

describe("duplicate-helpers", () => {
  describe("parseArrangementLength", () => {
    it("parses valid bar:beat duration to beats", () => {
      const result = parseArrangementLength("4:0", 4, 4);
      expect(result).toBe(16); // 4 bars in 4/4 = 16 beats
    });

    it("parses fractional beats correctly", () => {
      const result = parseArrangementLength("2:2.5", 4, 4);
      expect(result).toBe(10.5); // 2 bars (8 beats) + 2.5 beats
    });

    it("throws error for zero length", () => {
      expect(() => parseArrangementLength("0:0", 4, 4)).toThrow(
        "duplicate failed: arrangementLength must be positive",
      );
    });

    it("throws error for negative beats", () => {
      expect(() => parseArrangementLength("1:-1", 4, 4)).toThrow(
        "duplicate failed: arrangementLength Beats must be 0 or greater, got: -1",
      );
    });

    it("throws error for invalid format", () => {
      expect(() => parseArrangementLength("abc:def", 4, 4)).toThrow(
        /Invalid bar:beat duration format/,
      );
    });

    it("throws error for negative bars", () => {
      expect(() => parseArrangementLength("-1:0", 4, 4)).toThrow(
        "duplicate failed: arrangementLength Bars must be 0 or greater, got: -1",
      );
    });

    it("handles different time signatures", () => {
      const result = parseArrangementLength("2:0", 3, 4);
      expect(result).toBe(6); // 2 bars in 3/4 = 6 beats
    });
  });

  describe("findRoutingOptionForDuplicateNames", () => {
    it("returns single match when no duplicates exist", () => {
      const sourceTrack = {
        id: "1",
        getProperty: () => {},
      };
      const availableTypes = [
        { display_name: "Track 1", value: "track1" },
        { display_name: "Track 2", value: "track2" },
      ];

      const result = findRoutingOptionForDuplicateNames(
        sourceTrack,
        "Track 1",
        availableTypes,
      );

      expect(result).toEqual({ display_name: "Track 1", value: "track1" });
    });

    it("returns undefined when no matches found", () => {
      const sourceTrack = {
        id: "1",
        getProperty: () => {},
      };
      const availableTypes = [{ display_name: "Track 2", value: "track2" }];

      const result = findRoutingOptionForDuplicateNames(
        sourceTrack,
        "Track 1",
        availableTypes,
      );

      expect(result).toBeUndefined();
    });

    it("finds correct option when multiple tracks have same name", () => {
      // Mock LiveAPI for global access
      global.LiveAPI = createMockLiveAPI(["id1", "id2", "id3"], {
        id1: "Drums",
        id2: "Drums",
        id3: "Bass",
      });

      const sourceTrack = {
        id: "id1",
        getProperty: () => {},
      };

      const availableTypes = [
        { display_name: "Drums", value: "drums1" },
        { display_name: "Drums", value: "drums2" },
        { display_name: "Bass", value: "bass" },
      ];

      const result = findRoutingOptionForDuplicateNames(
        sourceTrack,
        "Drums",
        availableTypes,
      );

      // Should return the first "Drums" option since sourceTrack is id1 (first Drums track)
      expect(result).toEqual({ display_name: "Drums", value: "drums1" });
    });

    it("finds correct option for second track with duplicate name", () => {
      global.LiveAPI = createMockLiveAPI(["id1", "id2", "id3"], {
        id1: "Drums",
        id2: "Drums",
        id3: "Bass",
      });

      const sourceTrack = {
        id: "id2",
        getProperty: () => {},
      };

      const availableTypes = [
        { display_name: "Drums", value: "drums1" },
        { display_name: "Drums", value: "drums2" },
      ];

      const result = findRoutingOptionForDuplicateNames(
        sourceTrack,
        "Drums",
        availableTypes,
      );

      // Should return the second "Drums" option since sourceTrack is id2 (second Drums track)
      expect(result).toEqual({ display_name: "Drums", value: "drums2" });
    });

    it("returns undefined when source track not found in duplicate list", () => {
      global.LiveAPI = createMockLiveAPI(["id1", "id2"], {
        id1: "Drums",
        id2: "Drums",
      });

      const sourceTrack = {
        id: "id999", // Non-existent track
        getProperty: () => {},
      };

      const availableTypes = [
        { display_name: "Drums", value: "drums1" },
        { display_name: "Drums", value: "drums2" },
      ];

      const result = findRoutingOptionForDuplicateNames(
        sourceTrack,
        "Drums",
        availableTypes,
      );

      expect(result).toBeUndefined();
    });
  });
});
