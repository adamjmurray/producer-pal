import { describe, expect, it, vi, beforeEach } from "vitest";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.js";
import {
  liveApiCall,
  liveApiId,
  liveApiSet,
  setupDeviceDuplicationMocks,
} from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.js";

// Mock moveDeviceToPath to track calls
vi.mock(import("#src/tools/device/update/update-device-helpers.js"), () => ({
  moveDeviceToPath: vi.fn(),
}));

// Mock console.error to capture warnings
vi.mock(import("#src/shared/v8-max-console.js"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

// Import the mocks after vi.mock
import { moveDeviceToPath as moveDeviceToPathMock } from "#src/tools/device/update/update-device-helpers.js";
import * as consoleMock from "#src/shared/v8-max-console.js";

describe("duplicate - device duplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should duplicate a device to position after original (no toPath)", () => {
    setupDeviceDuplicationMocks("device1", "live_set tracks 0 devices 2");

    const result = duplicate({ type: "device", id: "device1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/devices/2",
    });

    // Should duplicate track 0
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_track",
      0,
    );

    // Should move device to t0/d3 (position after original at d2)
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _path: "live_set tracks 1 devices 2",
      }),
      "t0/d3",
    );

    // Should delete the temp track
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "delete_track",
      1,
    );
  });

  it("should duplicate a device with toPath to different track", () => {
    setupDeviceDuplicationMocks("device1", "live_set tracks 0 devices 1");

    const result = duplicate({
      type: "device",
      id: "device1",
      toPath: "t2/d0",
    });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/devices/1",
    });

    // Should move device to t3/d0 (adjusted because temp track inserted before t2)
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _path: "live_set tracks 1 devices 1",
      }),
      "t3/d0",
    );
  });

  it("should duplicate a device in a rack chain", () => {
    setupDeviceDuplicationMocks(
      "rack_device1",
      "live_set tracks 1 devices 0 chains 0 devices 1",
    );

    const result = duplicate({ type: "device", id: "rack_device1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/2/devices/0/chains/0/devices/1",
    });

    // Should duplicate track 1
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "duplicate_track",
      1,
    );

    // Should move device (from temp track at index 2)
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _path: "live_set tracks 2 devices 0 chains 0 devices 1",
      }),
      "t1/d0/c0/d2",
    );

    // Should delete the temp track at index 2
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "delete_track",
      2,
    );
  });

  it("should emit warning when count > 1", () => {
    setupDeviceDuplicationMocks("device1", "live_set tracks 0 devices 0");

    duplicate({ type: "device", id: "device1", count: 3 });

    expect(consoleMock.error).toHaveBeenCalledWith(
      "Warning: count parameter ignored for device duplication (only single copy supported)",
    );
  });

  it("should throw error for device on return track", () => {
    setupDeviceDuplicationMocks(
      "return_device1",
      "live_set return_tracks 0 devices 0",
    );

    expect(() => duplicate({ type: "device", id: "return_device1" })).toThrow(
      "cannot duplicate devices on return/master tracks",
    );
  });

  it("should throw error for device on master track", () => {
    setupDeviceDuplicationMocks(
      "master_device1",
      "live_set master_track devices 0",
    );

    expect(() => duplicate({ type: "device", id: "master_device1" })).toThrow(
      "cannot duplicate devices on return/master tracks",
    );
  });

  it("should set custom name on duplicated device", () => {
    setupDeviceDuplicationMocks("device1", "live_set tracks 0 devices 0");

    duplicate({ type: "device", id: "device1", name: "My Effect" });

    // Check that set was called with name
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ _path: "live_set tracks 1 devices 0" }),
      "name",
      "My Effect",
    );
  });

  it("should not adjust destination for tracks before source", () => {
    setupDeviceDuplicationMocks("device1", "live_set tracks 5 devices 0");

    duplicate({ type: "device", id: "device1", toPath: "t2/d0" });

    // Destination t2 is before source t5, should not be adjusted
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t2/d0",
    );
  });

  it("should throw and cleanup if device not found in duplicated track", () => {
    setupDeviceDuplicationMocks("device1", "live_set tracks 0 devices 0");

    // Mock id to return "0" for the temp device path (makes exists() return false)
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set tracks 1 devices 0") {
        return "0"; // Makes exists() return false
      }

      return this._id;
    });

    expect(() => duplicate({ type: "device", id: "device1" })).toThrow(
      "device not found in duplicated track",
    );

    // Should still delete the temp track after error
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "delete_track",
      1,
    );
  });

  it("should not adjust non-track destination path (return/master)", () => {
    setupDeviceDuplicationMocks("device1", "live_set tracks 0 devices 0");

    // Using a path that doesn't start with "t" should not be adjusted
    duplicate({ type: "device", id: "device1", toPath: "r0/d0" });

    // Should pass the path through unchanged (return track)
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "r0/d0",
    );
  });
});
