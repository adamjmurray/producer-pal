// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, beforeEach } from "vitest";
import { duplicate } from "#src/tools/operations/duplicate/duplicate.ts";
import { registerMockObject } from "#src/tools/operations/duplicate/helpers/duplicate-test-helpers.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";

// Mock moveDeviceToPath to track calls
vi.mock(import("#src/tools/device/update/update-device-helpers.ts"), () => ({
  moveDeviceToPath: vi.fn(),
}));

// Mock console.error to capture warnings
vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

// Import the mocks after vi.mock
import { moveDeviceToPath as moveDeviceToPathMock } from "#src/tools/device/update/update-device-helpers.ts";
import * as consoleMock from "#src/shared/v8-max-console.ts";

describe("duplicate - device duplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should duplicate a device to position after original (no toPath)", () => {
    registerMockObject("device1", {
      path: "live_set tracks 0 devices 2",
      type: "PluginDevice",
    });

    const liveSet = registerMockObject("live_set", { path: "live_set" });

    registerMockObject("live_set/tracks/1/devices/2", {
      path: "live_set tracks 1 devices 2",
    });

    const result = duplicate({ type: "device", id: "device1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/devices/2",
    });

    // Should duplicate track 0
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);

    // Should move device to t0/d3 (position after original at d2)
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _path: "live_set tracks 1 devices 2",
      }),
      "t0/d3",
    );

    // Should delete the temp track
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("should duplicate a device with toPath to different track", () => {
    registerMockObject("device1", {
      path: "live_set tracks 0 devices 1",
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: "live_set" });
    registerMockObject("live_set/tracks/1/devices/1", {
      path: "live_set tracks 1 devices 1",
    });

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
    registerMockObject("rack_device1", {
      path: "live_set tracks 1 devices 0 chains 0 devices 1",
      type: "PluginDevice",
    });

    const liveSet = registerMockObject("live_set", { path: "live_set" });

    registerMockObject("live_set/tracks/2/devices/0/chains/0/devices/1", {
      path: "live_set tracks 2 devices 0 chains 0 devices 1",
    });

    const result = duplicate({ type: "device", id: "rack_device1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/2/devices/0/chains/0/devices/1",
    });

    // Should duplicate track 1
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 1);

    // Should move device (from temp track at index 2)
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _path: "live_set tracks 2 devices 0 chains 0 devices 1",
      }),
      "t1/d0/c0/d2",
    );

    // Should delete the temp track at index 2
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 2);
  });

  it("should emit warning when count > 1", () => {
    registerMockObject("device1", {
      path: "live_set tracks 0 devices 0",
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: "live_set" });
    registerMockObject("live_set/tracks/1/devices/0", {
      path: "live_set tracks 1 devices 0",
    });

    duplicate({ type: "device", id: "device1", count: 3 });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      "count parameter ignored for device duplication (only single copy supported)",
    );
  });

  it("should throw error for device on return track", () => {
    registerMockObject("return_device1", {
      path: "live_set return_tracks 0 devices 0",
      type: "PluginDevice",
    });

    expect(() => duplicate({ type: "device", id: "return_device1" })).toThrow(
      "cannot duplicate devices on return/master tracks",
    );
  });

  it("should throw error for device on master track", () => {
    registerMockObject("master_device1", {
      path: "live_set master_track devices 0",
      type: "PluginDevice",
    });

    expect(() => duplicate({ type: "device", id: "master_device1" })).toThrow(
      "cannot duplicate devices on return/master tracks",
    );
  });

  it("should set custom name on duplicated device", () => {
    registerMockObject("device1", {
      path: "live_set tracks 0 devices 0",
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: "live_set" });
    const tempDevice = registerMockObject("live_set/tracks/1/devices/0", {
      path: "live_set tracks 1 devices 0",
    });

    duplicate({ type: "device", id: "device1", name: "My Effect" });

    // Check that set was called with name
    expect(tempDevice.set).toHaveBeenCalledWith("name", "My Effect");
  });

  it("should not adjust destination for tracks before source", () => {
    registerMockObject("device1", {
      path: "live_set tracks 5 devices 0",
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: "live_set" });
    registerMockObject("live_set/tracks/6/devices/0", {
      path: "live_set tracks 6 devices 0",
    });

    duplicate({ type: "device", id: "device1", toPath: "t2/d0" });

    // Destination t2 is before source t5, should not be adjusted
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t2/d0",
    );
  });

  it("should throw and cleanup if device not found in duplicated track", () => {
    registerMockObject("device1", {
      path: "live_set tracks 0 devices 0",
      type: "PluginDevice",
    });

    const liveSet = registerMockObject("live_set", { path: "live_set" });

    // Do NOT register "live_set tracks 1 devices 0" — this makes it non-existent
    mockNonExistentObjects();

    expect(() => duplicate({ type: "device", id: "device1" })).toThrow(
      "device not found in duplicated track",
    );

    // Should still delete the temp track after error
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("should not adjust non-track destination path (return/master)", () => {
    registerMockObject("device1", {
      path: "live_set tracks 0 devices 0",
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: "live_set" });
    registerMockObject("live_set/tracks/1/devices/0", {
      path: "live_set tracks 1 devices 0",
    });

    // Using a path that doesn't start with "t" should not be adjusted
    duplicate({ type: "device", id: "device1", toPath: "r0/d0" });

    // Should pass the path through unchanged (return track)
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "r0/d0",
    );
  });

  it("should throw error for invalid device path without device segment", () => {
    // Path with track but no device segment - triggers extractDevicePathWithinTrack error
    registerMockObject("device1", {
      path: "live_set tracks 0",
      type: "PluginDevice",
    });

    expect(() => duplicate({ type: "device", id: "device1" })).toThrow(
      "cannot extract device path",
    );
  });

  it("should handle device path ending with chain segment (not device)", () => {
    // When extractDevicePath returns a path that ends with a chain (not device),
    // it should use the fallback of returning the simplified path as-is
    // This tests the "return simplifiedPath" fallback in calculateDefaultDestination
    registerMockObject("device1", {
      path: "live_set tracks 0 devices 0 chains 0",
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: "live_set" });
    registerMockObject("live_set/tracks/1/devices/0/chains/0", {
      path: "live_set tracks 1 devices 0 chains 0",
    });

    const result = duplicate({ type: "device", id: "device1" });

    expect(result).toBeDefined();
    // When last segment is "c0" (not "d"), use the simplified path as destination
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t0/d0/c0",
    );
  });
});
