// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  children,
  liveApiCall,
  liveApiGet,
} from "#src/test/mocks/mock-live-api.ts";
import {
  shuffleArray,
  calculateShufflePositions,
  performShuffling,
} from "./transform-clips-shuffling-helpers.ts";

interface MockClip {
  id: string;
  trackIndex: number;
  getProperty: (prop: string) => number | null;
}

describe("transform-clips-shuffling-helpers", () => {
  describe("shuffleArray", () => {
    it("should return array with same elements in different order", () => {
      const array = [1, 2, 3, 4, 5];
      // Use a seeded RNG that produces predictable results
      let seed = 0.5;

      const rng = (): number => {
        seed = (seed * 9301 + 49297) % 233280;

        return seed / 233280;
      };

      const shuffled = shuffleArray(array, rng);

      expect(shuffled).toHaveLength(array.length);
      expect(shuffled.sort()).toStrictEqual(array.sort());
    });

    it("should not modify the original array", () => {
      const array = [1, 2, 3, 4, 5];
      const originalCopy = [...array];
      const rng = (): number => 0.5;

      shuffleArray(array, rng);

      expect(array).toStrictEqual(originalCopy);
    });

    it("should handle empty array", () => {
      const rng = (): number => 0.5;

      const shuffled = shuffleArray([], rng);

      expect(shuffled).toStrictEqual([]);
    });

    it("should handle single element array", () => {
      const rng = (): number => 0.5;

      const shuffled = shuffleArray([42], rng);

      expect(shuffled).toStrictEqual([42]);
    });

    it("should produce different results with different RNG values", () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const rng1 = (): number => 0.1;
      const rng2 = (): number => 0.9;

      const shuffled1 = shuffleArray(array, rng1);
      const shuffled2 = shuffleArray(array, rng2);

      // With different constant RNG values, shuffles should differ
      expect(shuffled1).not.toStrictEqual(shuffled2);
    });
  });

  describe("calculateShufflePositions", () => {
    it("should calculate correct positions for sequential clips without gaps", () => {
      const sortedClipInfo = [
        { startTime: 0, length: 4 },
        { startTime: 4, length: 4 },
        { startTime: 8, length: 4 },
      ];
      // Keep same order
      const shuffledIndices = [0, 1, 2];

      const positions = calculateShufflePositions(
        sortedClipInfo,
        shuffledIndices,
      );

      expect(positions).toStrictEqual([0, 4, 8]);
    });

    it("should preserve gaps when shuffling", () => {
      // Clips with 2-beat gaps between them
      const sortedClipInfo = [
        { startTime: 0, length: 4 },
        { startTime: 6, length: 4 }, // gap of 2
        { startTime: 12, length: 4 }, // gap of 2
      ];
      // Keep same order
      const shuffledIndices = [0, 1, 2];

      const positions = calculateShufflePositions(
        sortedClipInfo,
        shuffledIndices,
      );

      expect(positions).toStrictEqual([0, 6, 12]);
    });

    it("should handle reversed order", () => {
      const sortedClipInfo = [
        { startTime: 0, length: 4 },
        { startTime: 4, length: 8 },
        { startTime: 12, length: 2 },
      ];
      // Reverse order
      const shuffledIndices = [2, 1, 0];

      const positions = calculateShufflePositions(
        sortedClipInfo,
        shuffledIndices,
      );

      // clip 2 (length 2) at position 0
      // clip 1 (length 8) at position 2 (0 + 2 + gap of 0)
      // clip 0 (length 4) at position 10 (2 + 8 + gap of 0)
      expect(positions).toStrictEqual([0, 2, 10]);
    });

    it("should handle clips with varying lengths", () => {
      const sortedClipInfo = [
        { startTime: 0, length: 2 },
        { startTime: 2, length: 6 },
        { startTime: 8, length: 4 },
      ];
      // Shuffle: second clip first, then third, then first
      const shuffledIndices = [1, 2, 0];

      const positions = calculateShufflePositions(
        sortedClipInfo,
        shuffledIndices,
      );

      // clip 1 (length 6) at position 0
      // clip 2 (length 4) at position 6 (0 + 6 + gap of 0)
      // clip 0 (length 2) at position 10 (6 + 4 + gap of 0)
      expect(positions).toStrictEqual([0, 6, 10]);
    });

    it("should preserve gap pattern when shuffling with gaps", () => {
      // Original: clips at 0-4, 6-10, 14-18 (gaps of 2, then 4)
      const sortedClipInfo = [
        { startTime: 0, length: 4 },
        { startTime: 6, length: 4 }, // gap of 2
        { startTime: 14, length: 4 }, // gap of 4
      ];
      // Reverse order
      const shuffledIndices = [2, 1, 0];

      const positions = calculateShufflePositions(
        sortedClipInfo,
        shuffledIndices,
      );

      // clip 2 (length 4) at position 0
      // clip 1 (length 4) at position 6 (0 + 4 + gap of 2)
      // clip 0 (length 4) at position 14 (6 + 4 + gap of 4)
      expect(positions).toStrictEqual([0, 6, 14]);
    });

    it("should handle single clip", () => {
      const sortedClipInfo = [{ startTime: 8, length: 4 }];
      const shuffledIndices = [0];

      const positions = calculateShufflePositions(
        sortedClipInfo,
        shuffledIndices,
      );

      expect(positions).toStrictEqual([8]);
    });

    it("should handle clips starting at non-zero position", () => {
      const sortedClipInfo = [
        { startTime: 16, length: 4 },
        { startTime: 20, length: 4 },
      ];
      const shuffledIndices = [1, 0];

      const positions = calculateShufflePositions(
        sortedClipInfo,
        shuffledIndices,
      );

      // clip 1 (length 4) at position 16 (original start)
      // clip 0 (length 4) at position 20 (16 + 4 + gap of 0)
      expect(positions).toStrictEqual([16, 20]);
    });
  });

  describe("performShuffling", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should warn and return early when arrangementClips is empty", () => {
      const clips: LiveAPI[] = [];
      const warnings = new Set<string>();
      const rng = (): number => 0.5;
      const context = { holdingAreaStartBeats: 1000 };

      performShuffling([], clips, warnings, rng, context);

      expect(outlet).toHaveBeenCalledWith(
        1,
        "shuffleOrder requires arrangement clips",
      );
      expect(warnings.has("shuffle-no-arrangement")).toBe(true);
      expect(clips).toHaveLength(0);
    });

    it("should not warn twice for empty arrangementClips", () => {
      vi.mocked(outlet).mockClear();
      const clips: LiveAPI[] = [];
      const warnings = new Set<string>();

      warnings.add("shuffle-no-arrangement");
      const rng = (): number => 0.5;
      const context = { holdingAreaStartBeats: 1000 };

      performShuffling([], clips, warnings, rng, context);

      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });

    it("should return early without changes for single clip", () => {
      const mockClip: MockClip = {
        id: "clip1",
        trackIndex: 0,
        getProperty: vi.fn((prop: string) => {
          if (prop === "start_time") return 0;
          if (prop === "length") return 4;

          return null;
        }),
      };
      const clips = [mockClip as unknown as LiveAPI];
      const warnings = new Set<string>();
      const rng = (): number => 0.5;
      const context = { holdingAreaStartBeats: 1000 };

      performShuffling(
        [mockClip as unknown as LiveAPI],
        clips,
        warnings,
        rng,
        context,
      );

      // Should not call any LiveAPI methods for single clip
      expect(liveApiCall).not.toHaveBeenCalled();
    });

    it("should shuffle multiple arrangement clips", () => {
      // Create mock clips with proper structure
      const mockClip1: MockClip = {
        id: "clip1",
        trackIndex: 0,
        getProperty: vi.fn((prop: string) => {
          if (prop === "start_time") return 0;
          if (prop === "length") return 4;

          return null;
        }),
      };
      const mockClip2: MockClip = {
        id: "clip2",
        trackIndex: 0,
        getProperty: vi.fn((prop: string) => {
          if (prop === "start_time") return 4;
          if (prop === "length") return 4;

          return null;
        }),
      };

      liveApiCall.mockReturnValue(["id", "tempClip"]);
      liveApiGet.mockImplementation(function (
        this: { _path?: string },
        prop: string,
      ) {
        if (prop === "arrangement_clips") {
          return children("newClip1", "newClip2");
        }

        return [];
      });

      const clips: LiveAPI[] = [];
      const warnings = new Set<string>();
      const rng = (): number => 0.5;
      const context = { holdingAreaStartBeats: 1000 };

      performShuffling(
        [mockClip1 as unknown as LiveAPI, mockClip2 as unknown as LiveAPI],
        clips,
        warnings,
        rng,
        context,
      );

      // Should call duplicate_clip_to_arrangement for each clip
      expect(liveApiCall).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.any(String),
        expect.any(Number),
      );
      // clips array should be repopulated with fresh clips
      expect(clips).toHaveLength(2);
    });
  });
});
