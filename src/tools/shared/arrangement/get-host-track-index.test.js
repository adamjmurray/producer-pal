import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiPath } from "#src/test/mocks/mock-live-api.js";
import { getHostTrackIndex } from "./get-host-track-index.js";

describe("getHostTrackIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return track index when device path matches pattern", () => {
    liveApiPath.mockReturnValue("live_set tracks 5 devices 0");

    const result = getHostTrackIndex();

    expect(result).toBe(5);
  });

  it("should return null when device path does not match pattern", () => {
    liveApiPath.mockReturnValue("some other path without tracks");

    const result = getHostTrackIndex();

    expect(result).toBe(null);
  });

  it("should return null when LiveAPI.from throws an error", () => {
    // Mock the global LiveAPI.from to throw an error
    const originalLiveAPI = global.LiveAPI;

    global.LiveAPI = {
      from: vi.fn(() => {
        throw new Error("LiveAPI not available");
      }),
    };

    const result = getHostTrackIndex();

    expect(result).toBe(null);

    // Restore the original LiveAPI
    global.LiveAPI = originalLiveAPI;
  });

  it("should parse track index correctly for different track numbers", () => {
    const testCases = [
      { path: "live_set tracks 0 devices 0", expected: 0 },
      { path: "live_set tracks 123 devices 0", expected: 123 },
      { path: "live_set tracks 99 devices 1", expected: 99 },
    ];

    for (const { path, expected } of testCases) {
      liveApiPath.mockReturnValue(path);

      const result = getHostTrackIndex();

      expect(result).toBe(expected);
    }
  });
});
