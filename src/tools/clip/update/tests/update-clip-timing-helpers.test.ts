// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBeatPositions } from "../helpers/update-clip-timing-helpers.ts";

describe("update-clip-timing-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateBeatPositions", () => {
    it("should warn when firstStart exceeds end_marker", () => {
      const mockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "end_marker") return 4; // 1 bar at 4/4

          return 0;
        }),
      };

      const result = calculateBeatPositions({
        firstStart: "3|1", // 8 beats > end_marker (4)
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip as unknown as LiveAPI,
        isLooping: true,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("firstStart parameter ignored"),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("exceeds clip content boundary"),
      );
      expect(result.startMarkerBeats).toBeNull();
      expect(result.firstStartBeats).toBe(8); // Still calculated, just not applied
    });

    it("should set startMarkerBeats when firstStart is within end_marker", () => {
      vi.mocked(outlet).mockClear();

      const mockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "end_marker") return 8; // 2 bars at 4/4

          return 0;
        }),
      };

      const result = calculateBeatPositions({
        firstStart: "1|3", // 2 beats < end_marker (8)
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip as unknown as LiveAPI,
        isLooping: true,
      });

      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
      expect(result.startMarkerBeats).toBe(2);
      expect(result.firstStartBeats).toBe(2);
    });

    it("rejects a 0-indexed start with the 1-indexing steer (parity with create-clip)", () => {
      const mockClip = {
        getProperty: vi.fn(() => 0),
      };

      expect(() =>
        calculateBeatPositions({
          start: "1|0",
          timeSigNumerator: 4,
          timeSigDenominator: 4,
          clip: mockClip as unknown as LiveAPI,
          isLooping: true,
        }),
      ).toThrow(/beats are 1-indexed/);
    });

    it("rejects a 0-indexed firstStart with the 1-indexing steer", () => {
      const mockClip = {
        getProperty: vi.fn(() => 0),
      };

      expect(() =>
        calculateBeatPositions({
          firstStart: "0|1",
          timeSigNumerator: 4,
          timeSigDenominator: 4,
          clip: mockClip as unknown as LiveAPI,
          isLooping: true,
        }),
      ).toThrow(/bars are 1-indexed/);
    });

    it("should not warn when start exceeds end_marker (silent skip intentional)", () => {
      vi.mocked(outlet).mockClear();

      const mockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "end_marker") return 4; // 1 bar at 4/4

          return 0;
        }),
      };

      const result = calculateBeatPositions({
        start: "3|1", // 8 beats > end_marker (4), but no warning for start param
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip as unknown as LiveAPI,
        isLooping: true,
      });

      // No warning for start param - silent skip is intentional
      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
      expect(result.startMarkerBeats).toBeNull();
      expect(result.startBeats).toBe(8);
    });
  });
});
