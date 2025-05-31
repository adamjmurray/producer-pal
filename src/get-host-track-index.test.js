// src/get-host-track-index.test.js
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getHostTrackIndex } from "./get-host-track-index.js";

// Mock LiveAPI
const mockLiveAPI = vi.fn();
vi.stubGlobal("LiveAPI", mockLiveAPI);

describe("getHostTrackIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return track index when device path matches pattern", () => {
    const mockDevice = {
      path: "live_set tracks 5 devices 0",
    };
    mockLiveAPI.mockReturnValue(mockDevice);

    const result = getHostTrackIndex();

    expect(mockLiveAPI).toHaveBeenCalledWith("this_device");
    expect(result).toBe(5);
  });

  it("should return null when device path does not match pattern", () => {
    const mockDevice = {
      path: "some other path without tracks",
    };
    mockLiveAPI.mockReturnValue(mockDevice);

    const result = getHostTrackIndex();

    expect(mockLiveAPI).toHaveBeenCalledWith("this_device");
    expect(result).toBe(null);
  });

  it("should return null when LiveAPI constructor throws an error", () => {
    mockLiveAPI.mockImplementation(() => {
      throw new Error("LiveAPI not available");
    });

    const result = getHostTrackIndex();

    expect(mockLiveAPI).toHaveBeenCalledWith("this_device");
    expect(result).toBe(null);
  });

  it("should parse track index correctly for different track numbers", () => {
    const testCases = [
      { path: "live_set tracks 0 devices 0", expected: 0 },
      { path: "live_set tracks 123 devices 0", expected: 123 },
      { path: "live_set tracks 99 devices 1", expected: 99 },
    ];

    testCases.forEach(({ path, expected }) => {
      const mockDevice = { path };
      mockLiveAPI.mockReturnValue(mockDevice);

      const result = getHostTrackIndex();
      expect(result).toBe(expected);
    });
  });
});