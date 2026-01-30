import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBeatPositions } from "./update-clip-timing-helpers.ts";

describe("update-clip-timing-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("calculateBeatPositions", () => {
    it("should warn when firstStart exceeds end_marker", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

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

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("firstStart parameter ignored"),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("exceeds clip content boundary"),
      );
      expect(result.startMarkerBeats).toBeNull();
      expect(result.firstStartBeats).toBe(8); // Still calculated, just not applied

      consoleErrorSpy.mockRestore();
    });

    it("should set startMarkerBeats when firstStart is within end_marker", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

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

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(result.startMarkerBeats).toBe(2);
      expect(result.firstStartBeats).toBe(2);

      consoleErrorSpy.mockRestore();
    });

    it("should not warn when start exceeds end_marker (silent skip intentional)", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

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
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(result.startMarkerBeats).toBeNull();
      expect(result.startBeats).toBe(8);

      consoleErrorSpy.mockRestore();
    });
  });
});
