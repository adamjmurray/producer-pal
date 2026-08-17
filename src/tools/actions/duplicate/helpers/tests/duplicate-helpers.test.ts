// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  parseArrangementLength,
  getMinimalClipInfo,
  duplicateClipToArrangement,
} from "../duplicate-helpers.ts";
import { duplicateClipSlot } from "../clip/duplicate-clip-slot-helpers.ts";
import {
  findRoutingOptionForDuplicateNames,
  type RoutingType,
} from "../duplicate-routing-helpers.ts";

interface TrackNameMapping {
  [path: string]: string;
}

interface MockLiveAPIInstance {
  path: string;
  _isLiveSet?: boolean;
  getChildIds: (property: string) => string[];
  getProperty: (prop: string) => string | null;
  id: string;
}

interface MockLiveAPIConstructor {
  new (path: string): MockLiveAPIInstance;
  from: (idOrPath: string | { toString: () => string }) => MockLiveAPIInstance;
}

/**
 * Helper to create a mock LiveAPI class for testing duplicate routing scenarios
 * @param trackIds - Array of track IDs
 * @param trackNameMapping - Mapping of paths to track names
 * @returns Mock LiveAPI constructor
 */
function createMockLiveAPI(
  trackIds: string[],
  trackNameMapping: TrackNameMapping,
): MockLiveAPIConstructor {
  class MockLiveAPI implements MockLiveAPIInstance {
    path: string;
    _isLiveSet?: boolean;

    constructor(path: string) {
      this.path = path;

      if (path === livePath.liveSet) {
        this._isLiveSet = true;
      }
    }

    static from(idOrPath: string | { toString: () => string }): MockLiveAPI {
      return new MockLiveAPI(String(idOrPath));
    }

    getChildIds(property: string): string[] {
      if (this._isLiveSet && property === "tracks") {
        return trackIds;
      }

      return [];
    }

    getProperty(prop: string): string | null {
      if (prop === "name" && trackNameMapping[this.path]) {
        return trackNameMapping[this.path]!;
      }

      return null;
    }

    get id(): string {
      return this.path;
    }
  }

  return MockLiveAPI;
}

// Builds a stub source track with the given id and resolves its routing option.
function findRouting(
  sourceId: string,
  targetName: string,
  availableTypes: RoutingType[],
): RoutingType | undefined {
  const sourceTrack = { id: sourceId, getProperty: () => {} };

  return findRoutingOptionForDuplicateNames(
    sourceTrack as unknown as LiveAPI,
    targetName,
    availableTypes,
  );
}

describe("duplicate-helpers", () => {
  describe("getMinimalClipInfo", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns id for arrangement clip with its path and arrangementStart", () => {
      registerMockObject("live_set", {
        path: livePath.liveSet,
        type: "Song",
        properties: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });
      registerMockObject("456", {
        path: livePath.track(2).arrangementClip(0),
        type: "Clip",
        properties: {
          is_arrangement_clip: 1,
          start_time: 4.0,
        },
      });

      const result = getMinimalClipInfo(LiveAPI.from("456"));

      expect(result.id).toBe("456");
      expect(result.path).toBe("t2");
      expect(result.arrangementStart).toBe("2|1");
    });

    it("omits the path when specified in omitFields for arrangement clip", () => {
      registerMockObject("live_set", {
        path: livePath.liveSet,
        type: "Song",
        properties: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });
      registerMockObject("457", {
        path: livePath.track(2).arrangementClip(0),
        type: "Clip",
        properties: {
          is_arrangement_clip: 1,
          start_time: 0,
        },
      });

      const result = getMinimalClipInfo(LiveAPI.from("457"), ["path"]);

      expect(result.id).toBe("457");
      expect(result.path).toBeUndefined();
      expect(result.arrangementStart).toBe("1|1");
    });

    it("omits arrangementStart when specified in omitFields for arrangement clip", () => {
      registerMockObject("live_set", {
        path: livePath.liveSet,
        type: "Song",
        properties: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });
      registerMockObject("458", {
        path: livePath.track(2).arrangementClip(0),
        type: "Clip",
        properties: {
          is_arrangement_clip: 1,
          start_time: 8.0,
        },
      });

      const result = getMinimalClipInfo(LiveAPI.from("458"), [
        "arrangementStart",
      ]);

      expect(result.id).toBe("458");
      expect(result.path).toBe("t2");
      expect(result.arrangementStart).toBeUndefined();
    });

    it("returns id and path for session clip", () => {
      registerMockObject("789", {
        path: livePath.track(1).clipSlot(3).clip(),
        type: "Clip",
        properties: {
          is_arrangement_clip: 0,
        },
      });

      const result = getMinimalClipInfo(LiveAPI.from("789"));

      expect(result.id).toBe("789");
      expect(result.path).toBe("t1/s3");
    });

    it("omits the path when specified in omitFields for session clip", () => {
      registerMockObject("790", {
        path: livePath.track(1).clipSlot(3).clip(),
        type: "Clip",
        properties: { is_arrangement_clip: 0 },
      });

      const result = getMinimalClipInfo(LiveAPI.from("790"), ["path"]);

      expect(result.id).toBe("790");
      expect(result.path).toBeUndefined();
    });

    it("throws error when trackIndex is null for arrangement clip", () => {
      const mockClip = {
        id: "792",
        path: `invalid_path`,
        trackIndex: null,
        getProperty: (property: string) => {
          if (property === "is_arrangement_clip") {
            return 1;
          }

          if (property === "start_time") {
            return 0;
          }

          return 0;
        },
      };

      expect(() => getMinimalClipInfo(mockClip as unknown as LiveAPI)).toThrow(
        "getMinimalClipInfo failed: could not determine trackIndex for clip",
      );
    });

    it("throws error when trackIndex or sceneIndex is null for session clip", () => {
      const mockClip = {
        id: "793",
        path: `invalid_path`,
        trackIndex: null,
        sceneIndex: null,
        getProperty: () => 0,
      };

      expect(() => getMinimalClipInfo(mockClip as unknown as LiveAPI)).toThrow(
        "getMinimalClipInfo failed: could not determine trackIndex/sceneIndex for clip",
      );
    });
  });

  describe("parseArrangementLength", () => {
    it("parses Nbar duration to beats", () => {
      const result = parseArrangementLength("4bar", 4, 4);

      expect(result).toBe(16); // 4 bars in 4/4 = 16 beats
    });

    it("parses Nbar+n<fraction> durations", () => {
      const result = parseArrangementLength("2bar+n5/8", 4, 4);

      expect(result).toBe(10.5); // 2 bars (8 beats) + n5/8 whole note (2.5 beats)
    });

    it("parses note-value-only durations", () => {
      expect(parseArrangementLength("n1/4", 4, 4)).toBe(1); // quarter note
      expect(parseArrangementLength("n/8", 4, 4)).toBe(0.5); // implicit numerator
    });

    it("rejects bare fractions (n prefix required)", () => {
      expect(() => parseArrangementLength("1/4", 4, 4)).toThrow(
        /Invalid duration format/,
      );
    });

    it("throws error for zero length", () => {
      expect(() => parseArrangementLength("0bar", 4, 4)).toThrow(
        "duplicate failed: arrangementLength must be positive",
      );
    });

    it("throws error for invalid format", () => {
      expect(() => parseArrangementLength("abc", 4, 4)).toThrow(
        /Invalid duration format/,
      );
    });

    it("rejects bare numbers; off-grid lengths use the n<beats>/4 escape", () => {
      // A duration is never a bare scalar. Off-grid lengths must use the
      // decimal-numerator escape abletonBeatsToDuration emits (n<beats>/4).
      expect(() => parseArrangementLength("4", 4, 4)).toThrow(
        /Invalid duration format/,
      );
      expect(() => parseArrangementLength("5.9877", 4, 4)).toThrow(
        /Invalid duration format/,
      );
      expect(parseArrangementLength("n5.9877/4", 4, 4)).toBeCloseTo(5.9877, 6);
    });

    it("throws error for retired bar:beat glyph", () => {
      expect(() => parseArrangementLength("1:0", 4, 4)).toThrow(
        /Invalid duration format/,
      );
    });

    it("handles different time signatures", () => {
      const result = parseArrangementLength("2bar", 3, 4);

      expect(result).toBe(6); // 2 bars in 3/4 = 6 beats
    });
  });

  describe("findRoutingOptionForDuplicateNames", () => {
    it("returns single match when no duplicates exist", () => {
      const result = findRouting("1", "Track 1", [
        { display_name: "Track 1", identifier: "track1" },
        { display_name: "Track 2", identifier: "track2" },
      ]);

      expect(result).toStrictEqual({
        display_name: "Track 1",
        identifier: "track1",
      });
    });

    it("returns undefined when no matches found", () => {
      const result = findRouting("1", "Track 1", [
        { display_name: "Track 2", identifier: "track2" },
      ]);

      expect(result).toBeUndefined();
    });

    it("finds correct option when multiple tracks have same name", () => {
      // Mock LiveAPI for global access
      (global as Record<string, unknown>).LiveAPI = createMockLiveAPI(
        ["id1", "id2", "id3"],
        { id1: "Drums", id2: "Drums", id3: "Bass" },
      );

      const result = findRouting("id1", "Drums", [
        { display_name: "Drums", identifier: "drums1" },
        { display_name: "Drums", identifier: "drums2" },
        { display_name: "Bass", identifier: "bass" },
      ]);

      // Should return the first "Drums" option since sourceTrack is id1 (first Drums track)
      expect(result).toStrictEqual({
        display_name: "Drums",
        identifier: "drums1",
      });
    });

    it("finds correct option for second track with duplicate name", () => {
      (global as Record<string, unknown>).LiveAPI = createMockLiveAPI(
        ["id1", "id2", "id3"],
        { id1: "Drums", id2: "Drums", id3: "Bass" },
      );

      const result = findRouting("id2", "Drums", [
        { display_name: "Drums", identifier: "drums1" },
        { display_name: "Drums", identifier: "drums2" },
      ]);

      // Should return the second "Drums" option since sourceTrack is id2 (second Drums track)
      expect(result).toStrictEqual({
        display_name: "Drums",
        identifier: "drums2",
      });
    });

    it("returns undefined when source track not found in duplicate list", () => {
      (global as Record<string, unknown>).LiveAPI = createMockLiveAPI(
        ["id1", "id2"],
        { id1: "Drums", id2: "Drums" },
      );

      const result = findRouting("id999", "Drums", [
        // id999: non-existent track
        { display_name: "Drums", identifier: "drums1" },
        { display_name: "Drums", identifier: "drums2" },
      ]);

      expect(result).toBeUndefined();
    });
  });

  describe("duplicateClipSlot", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("throws error when source clip slot does not exist", () => {
      (global as Record<string, unknown>).LiveAPI = createClipSlotMockLiveAPI({
        sourceExists: false,
        sourceHasClip: false,
        destExists: true,
      });

      expect(() => duplicateClipSlot(0, 0, 1, 0)).toThrow(
        "duplicate failed: source clip slot at track 0, scene 0 does not exist",
      );
    });

    it("throws error when source clip slot has no clip", () => {
      (global as Record<string, unknown>).LiveAPI = createClipSlotMockLiveAPI({
        sourceExists: true,
        sourceHasClip: false,
        destExists: true,
      });

      expect(() => duplicateClipSlot(0, 0, 1, 0)).toThrow(
        "duplicate failed: no clip in source clip slot at track 0, scene 0",
      );
    });

    it("throws error when destination clip slot does not exist", () => {
      // Mock source clip slot exists with clip
      (global as Record<string, unknown>).LiveAPI = createClipSlotMockLiveAPI({
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

    it("throws error when clip does not exist", async () => {
      (global as Record<string, unknown>).LiveAPI =
        createArrangementMockLiveAPI({ clipExists: false });

      await expect(
        duplicateClipToArrangement("nonexistent", 0),
      ).rejects.toThrow(
        'duplicate failed: no clip exists for clipId "nonexistent"',
      );
    });

    it("throws error when clip has no track index", async () => {
      (global as Record<string, unknown>).LiveAPI =
        createArrangementMockLiveAPI({
          clipExists: true,
          trackIndex: null,
        });

      await expect(duplicateClipToArrangement("clip1", 0)).rejects.toThrow(
        'duplicate failed: no track index for clipId "clip1"',
      );
    });
  });
});

interface ClipSlotMockOptions {
  sourceExists: boolean;
  sourceHasClip: boolean;
  destExists: boolean;
}

interface ClipSlotMockLiveAPIInstance {
  path: string;
  exists: () => boolean;
  getProperty: (prop: string) => boolean | null;
  id: string;
}

interface ClipSlotMockLiveAPIConstructor {
  new (path: string): ClipSlotMockLiveAPIInstance;
  from: (
    idOrPath: string | { toString: () => string },
  ) => ClipSlotMockLiveAPIInstance;
}

/**
 * Helper to create a mock LiveAPI class for clip slot duplication tests
 * @param options - Mock configuration options
 * @param options.sourceExists - Whether source clip slot exists
 * @param options.sourceHasClip - Whether source has a clip
 * @param options.destExists - Whether destination clip slot exists
 * @returns Mock LiveAPI constructor
 */
function createClipSlotMockLiveAPI({
  sourceExists,
  sourceHasClip,
  destExists,
}: ClipSlotMockOptions): ClipSlotMockLiveAPIConstructor {
  class MockLiveAPI implements ClipSlotMockLiveAPIInstance {
    path: string;

    constructor(path: string) {
      this.path = path;
    }

    static from(idOrPath: string | { toString: () => string }): MockLiveAPI {
      return new MockLiveAPI(String(idOrPath));
    }

    exists(): boolean {
      if (this.path.includes("tracks 0 clip_slots 0")) {
        return sourceExists;
      }

      if (this.path.includes("tracks 1 clip_slots 0")) {
        return destExists;
      }

      return true;
    }

    getProperty(prop: string): boolean | null {
      if (prop === "has_clip" && this.path.includes("tracks 0 clip_slots 0")) {
        return sourceHasClip;
      }

      return null;
    }

    get id(): string {
      return this.path.replaceAll(" ", "/");
    }
  }

  return MockLiveAPI;
}

interface ArrangementMockOptions {
  clipExists: boolean;
  trackIndex?: number | null;
}

interface ArrangementMockLiveAPIInstance {
  path: string;
  _path: string;
  trackIndex?: number | null;
  exists: () => boolean;
  id: string;
}

interface ArrangementMockLiveAPIConstructor {
  new (path: string): ArrangementMockLiveAPIInstance;
  from: (
    idOrPath: string | { toString: () => string },
  ) => ArrangementMockLiveAPIInstance;
}

/**
 * Helper to create a mock LiveAPI class for arrangement clip duplication tests
 * @param options - Mock configuration options
 * @param options.clipExists - Whether the clip exists
 * @param options.trackIndex - Track index for the clip
 * @returns Mock LiveAPI constructor
 */
function createArrangementMockLiveAPI({
  clipExists,
  trackIndex = 0,
}: ArrangementMockOptions): ArrangementMockLiveAPIConstructor {
  class MockLiveAPI implements ArrangementMockLiveAPIInstance {
    path: string;
    _path: string;
    trackIndex?: number | null;

    constructor(path: string) {
      this.path = path;
      this._path = path;

      if (path.includes("tracks") && !path.includes("clip")) {
        this.trackIndex = 0;
      } else if (clipExists) {
        this.trackIndex = trackIndex;
      }
    }

    static from(idOrPath: string | { toString: () => string }): MockLiveAPI {
      return new MockLiveAPI(String(idOrPath));
    }

    exists(): boolean {
      if (this.path === "clip1" || this.path === "nonexistent") {
        return clipExists;
      }

      return true;
    }

    get id(): string {
      return this.path.replaceAll(" ", "/");
    }
  }

  return MockLiveAPI;
}
