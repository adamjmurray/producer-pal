import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveApiGet,
  liveApiPath,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.js";
import {
  parseArrangementLength,
  getMinimalClipInfo,
  duplicateClipSlot,
  duplicateClipToArrangement,
} from "./duplicate-helpers.js";
import { findRoutingOptionForDuplicateNames } from "./duplicate-routing-helpers.js";

/**
 * Helper to create a mock LiveAPI class for testing duplicate routing scenarios
 * @param {Array<string>} trackIds - Array of track IDs
 * @param {object} trackNameMapping - Mapping of track paths to names
 * @returns {class} - Mock LiveAPI class
 */
function createMockLiveAPI(trackIds, trackNameMapping) {
  class MockLiveAPI {
    constructor(path) {
      this.path = path;

      if (path === "live_set") {
        this._isLiveSet = true;
      }
    }

    static from(idOrPath) {
      return new MockLiveAPI(idOrPath);
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
  }

  return MockLiveAPI;
}

describe("duplicate-helpers", () => {
  describe("getMinimalClipInfo", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns id for arrangement clip with trackIndex and arrangementStart", () => {
      const clipId = "456";

      liveApiPath.mockImplementation(function () {
        if (this._id === clipId) {
          return `live_set tracks 2 arrangement_clips 0`;
        }

        if (this._path === "live_set") {
          return "live_set";
        }

        return this._path;
      });

      mockLiveApiGet({
        [clipId]: {
          is_arrangement_clip: 1,
          start_time: 4.0,
        },
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      const mockClip = {
        id: clipId,
        path: `live_set tracks 2 arrangement_clips 0`,
        trackIndex: 2,
        getProperty: liveApiGet,
      };

      const result = getMinimalClipInfo(mockClip);

      expect(result.id).toBe(clipId);
      expect(result.trackIndex).toBe(2);
      expect(result.arrangementStart).toBe("2|1");
    });

    it("omits trackIndex when specified in omitFields for arrangement clip", () => {
      const clipId = "457";

      liveApiPath.mockImplementation(function () {
        if (this._id === clipId) {
          return `live_set tracks 2 arrangement_clips 0`;
        }

        return this._path;
      });

      mockLiveApiGet({
        [clipId]: {
          is_arrangement_clip: 1,
          start_time: 0,
        },
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      const mockClip = {
        id: clipId,
        path: `live_set tracks 2 arrangement_clips 0`,
        trackIndex: 2,
        getProperty: liveApiGet,
      };

      const result = getMinimalClipInfo(mockClip, ["trackIndex"]);

      expect(result.id).toBe(clipId);
      expect(result.trackIndex).toBeUndefined();
      expect(result.arrangementStart).toBe("1|1");
    });

    it("omits arrangementStart when specified in omitFields for arrangement clip", () => {
      const clipId = "458";

      liveApiPath.mockImplementation(function () {
        if (this._id === clipId) {
          return `live_set tracks 2 arrangement_clips 0`;
        }

        return this._path;
      });

      mockLiveApiGet({
        [clipId]: {
          is_arrangement_clip: 1,
          start_time: 8.0,
        },
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      const mockClip = {
        id: clipId,
        path: `live_set tracks 2 arrangement_clips 0`,
        trackIndex: 2,
        getProperty: liveApiGet,
      };

      const result = getMinimalClipInfo(mockClip, ["arrangementStart"]);

      expect(result.id).toBe(clipId);
      expect(result.trackIndex).toBe(2);
      expect(result.arrangementStart).toBeUndefined();
    });

    it("returns id, trackIndex, and sceneIndex for session clip", () => {
      const clipId = "789";

      liveApiPath.mockImplementation(function () {
        if (this._id === clipId) {
          return `live_set tracks 1 clip_slots 3 clip`;
        }

        return this._path;
      });

      mockLiveApiGet({
        [clipId]: {
          is_arrangement_clip: 0,
        },
      });

      const mockClip = {
        id: clipId,
        path: `live_set tracks 1 clip_slots 3 clip`,
        trackIndex: 1,
        sceneIndex: 3,
        getProperty: liveApiGet,
      };

      const result = getMinimalClipInfo(mockClip);

      expect(result.id).toBe(clipId);
      expect(result.trackIndex).toBe(1);
      expect(result.sceneIndex).toBe(3);
    });

    it.each([
      {
        omitField: "trackIndex",
        clipId: "790",
        expectedTrackIndex: undefined,
        expectedSceneIndex: 3,
      },
      {
        omitField: "sceneIndex",
        clipId: "791",
        expectedTrackIndex: 1,
        expectedSceneIndex: undefined,
      },
    ])(
      "omits $omitField when specified in omitFields for session clip",
      ({ omitField, clipId, expectedTrackIndex, expectedSceneIndex }) => {
        mockLiveApiGet({
          [clipId]: { is_arrangement_clip: 0 },
        });

        const mockClip = {
          id: clipId,
          path: `live_set tracks 1 clip_slots 3 clip`,
          trackIndex: 1,
          sceneIndex: 3,
          getProperty: liveApiGet,
        };

        const result = getMinimalClipInfo(mockClip, [omitField]);

        expect(result.id).toBe(clipId);
        expect(result.trackIndex).toBe(expectedTrackIndex);
        expect(result.sceneIndex).toBe(expectedSceneIndex);
      },
    );

    it("throws error when trackIndex is null for arrangement clip", () => {
      const clipId = "792";

      mockLiveApiGet({
        [clipId]: {
          is_arrangement_clip: 1,
          start_time: 0,
        },
      });

      const mockClip = {
        id: clipId,
        path: `invalid_path`,
        trackIndex: null,
        getProperty: liveApiGet,
      };

      expect(() => getMinimalClipInfo(mockClip)).toThrow(
        "getMinimalClipInfo failed: could not determine trackIndex for clip",
      );
    });

    it("throws error when trackIndex or sceneIndex is null for session clip", () => {
      const clipId = "793";

      mockLiveApiGet({
        [clipId]: {
          is_arrangement_clip: 0,
        },
      });

      const mockClip = {
        id: clipId,
        path: `invalid_path`,
        trackIndex: null,
        sceneIndex: null,
        getProperty: liveApiGet,
      };

      expect(() => getMinimalClipInfo(mockClip)).toThrow(
        "getMinimalClipInfo failed: could not determine trackIndex/sceneIndex for clip",
      );
    });
  });

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

      expect(result).toStrictEqual({
        display_name: "Track 1",
        value: "track1",
      });
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
      expect(result).toStrictEqual({ display_name: "Drums", value: "drums1" });
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
      expect(result).toStrictEqual({ display_name: "Drums", value: "drums2" });
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

  describe("duplicateClipSlot", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("throws error when destination clip slot does not exist", () => {
      // Mock source clip slot exists with clip
      global.LiveAPI = createClipSlotMockLiveAPI({
        sourceExists: true,
        sourceHasClip: true,
        destExists: false,
      });

      expect(() => duplicateClipSlot(0, 0, 1, 0)).toThrow(
        "duplicate failed: destination clip slot at track 1, scene 0 does not exist",
      );
    });
  });

  describe("duplicateClipToArrangement", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("throws error when clip does not exist", () => {
      global.LiveAPI = createArrangementMockLiveAPI({ clipExists: false });

      expect(() => duplicateClipToArrangement("nonexistent", 0)).toThrow(
        'duplicate failed: no clip exists for clipId "nonexistent"',
      );
    });

    it("throws error when clip has no track index", () => {
      global.LiveAPI = createArrangementMockLiveAPI({
        clipExists: true,
        trackIndex: null,
      });

      expect(() => duplicateClipToArrangement("clip1", 0)).toThrow(
        'duplicate failed: no track index for clipId "clip1"',
      );
    });
  });
});

/**
 * Helper to create a mock LiveAPI class for clip slot duplication tests
 * @param {object} opts - Options
 * @param {boolean} opts.sourceExists - Whether source clip slot exists
 * @param {boolean} opts.sourceHasClip - Whether source has a clip
 * @param {boolean} opts.destExists - Whether destination clip slot exists
 * @returns {class} - Mock LiveAPI class
 */
function createClipSlotMockLiveAPI({
  sourceExists,
  sourceHasClip,
  destExists,
}) {
  class MockLiveAPI {
    constructor(path) {
      this.path = path;
    }

    static from(idOrPath) {
      return new MockLiveAPI(idOrPath);
    }

    exists() {
      if (this.path.includes("tracks 0 clip_slots 0")) {
        return sourceExists;
      }

      if (this.path.includes("tracks 1 clip_slots 0")) {
        return destExists;
      }

      return true;
    }

    getProperty(prop) {
      if (prop === "has_clip" && this.path.includes("tracks 0 clip_slots 0")) {
        return sourceHasClip;
      }

      return null;
    }

    get id() {
      return this.path.replaceAll(" ", "/");
    }
  }

  return MockLiveAPI;
}

/**
 * Helper to create a mock LiveAPI class for arrangement clip duplication tests
 * @param {object} opts - Options
 * @param {boolean} opts.clipExists - Whether the clip exists
 * @param {number | null} [opts.trackIndex] - Track index or null
 * @returns {class} - Mock LiveAPI class
 */
function createArrangementMockLiveAPI({ clipExists, trackIndex = 0 }) {
  class MockLiveAPI {
    constructor(path) {
      this.path = path;
      this._path = path;

      if (path.includes("tracks") && !path.includes("clip")) {
        this.trackIndex = 0;
      } else if (clipExists) {
        this.trackIndex = trackIndex;
      }
    }

    static from(idOrPath) {
      return new MockLiveAPI(idOrPath);
    }

    exists() {
      if (this.path === "clip1" || this.path === "nonexistent") {
        return clipExists;
      }

      return true;
    }

    get id() {
      return this.path.replaceAll(" ", "/");
    }
  }

  return MockLiveAPI;
}
