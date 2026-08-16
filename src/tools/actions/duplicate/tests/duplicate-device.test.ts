// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, beforeEach } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerMockObject,
  setupDeviceDuplicationMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";

// Mock moveDeviceToPath to track calls
vi.mock(
  import("#src/tools/device/update/helpers/update-device-helpers.ts"),
  () => ({
    // Reports a completed move; tests that need a refused one override it.
    moveDeviceToPath: vi.fn(() => true),
  }),
);

// Mock console.error to capture warnings
vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

// Import the mocks after vi.mock
import { moveDeviceToPath as moveDeviceToPathMock } from "#src/tools/device/update/helpers/update-device-helpers.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";

describe("duplicate - device duplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should duplicate a device to position after original (no toPath)", async () => {
    registerMockObject("device1", {
      path: livePath.track(0).device(2),
      type: "PluginDevice",
    });

    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
    });

    const tempDevice = registerMockObject("live_set/tracks/1/devices/2", {
      path: livePath.track(1).device(2),
    });

    const result = await duplicate({ type: "device", id: "device1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1/devices/2",
    });

    // Default count (1) and no name → neither the count warn nor the name set fire.
    expect(consoleMock.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("count parameter ignored"),
    );
    expect(tempDevice.set).not.toHaveBeenCalledWith("name", expect.anything());

    // Should duplicate track 0
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 0);

    // Should move device to t0/d3 (position after original at d2)
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _path: String(livePath.track(1).device(2)),
      }),
      "t0/d3",
      expect.anything(),
    );

    // Should delete the temp track
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("should duplicate a device with toPath to different track", async () => {
    setupDeviceDuplicationMocks(1);

    const result = await duplicate({
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
        _path: String(livePath.track(1).device(1)),
      }),
      "t3/d0",
      expect.anything(),
    );
  });

  it("should duplicate a device in a rack chain", async () => {
    registerMockObject("rack_device1", {
      path: livePath.track(1).device(0).chain(0).device(1),
      type: "PluginDevice",
    });

    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
    });

    registerMockObject("live_set/tracks/2/devices/0/chains/0/devices/1", {
      path: livePath.track(2).device(0).chain(0).device(1),
    });

    const result = await duplicate({ type: "device", id: "rack_device1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/2/devices/0/chains/0/devices/1",
    });

    // Should duplicate track 1
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_track", 1);

    // Should move device (from temp track at index 2), naming the real source
    // so the chain-mixer warning reads the source chain, not the temp copy
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _path: String(livePath.track(2).device(0).chain(0).device(1)),
      }),
      "t1/d0/c0/d2",
      expect.objectContaining({ _id: "rack_device1" }),
    );

    // Should delete the temp track at index 2
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 2);
  });

  it("should emit warning when count > 1", async () => {
    setupDeviceDuplicationMocks();

    await duplicate({ type: "device", id: "device1", count: 3 });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      "count parameter ignored for device duplication (only single copy supported)",
    );
  });

  it("should throw error for device on return track", async () => {
    registerMockObject("return_device1", {
      path: livePath.returnTrack(0).device(0),
      type: "PluginDevice",
    });

    await expect(
      duplicate({ type: "device", id: "return_device1" }),
    ).rejects.toThrow("cannot duplicate devices on return/master tracks");
  });

  it("should throw error for device on master track", async () => {
    registerMockObject("master_device1", {
      path: livePath.masterTrack().device(0),
      type: "PluginDevice",
    });

    await expect(
      duplicate({ type: "device", id: "master_device1" }),
    ).rejects.toThrow("cannot duplicate devices on return/master tracks");
  });

  it("should set custom name on duplicated device", async () => {
    registerMockObject("device1", {
      path: livePath.track(0).device(0),
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: livePath.liveSet });
    const tempDevice = registerMockObject("live_set/tracks/1/devices/0", {
      path: livePath.track(1).device(0),
    });

    await duplicate({ type: "device", id: "device1", name: "My Effect" });

    // Check that set was called with name
    expect(tempDevice.set).toHaveBeenCalledWith("name", "My Effect");
  });

  it("should not adjust destination for tracks before source", async () => {
    registerMockObject("device1", {
      path: livePath.track(5).device(0),
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("live_set/tracks/6/devices/0", {
      path: livePath.track(6).device(0),
    });

    await duplicate({ type: "device", id: "device1", toPath: "t2/d0" });

    // Destination t2 is before source t5, should not be adjusted
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t2/d0",
      expect.anything(),
    );
  });

  it("should throw and cleanup if device not found in duplicated track", async () => {
    registerMockObject("device1", {
      path: livePath.track(0).device(0),
      type: "PluginDevice",
    });

    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
    });

    // Do NOT register "live_set tracks 1 devices 0" — this makes it non-existent
    mockNonExistentObjects();

    await expect(duplicate({ type: "device", id: "device1" })).rejects.toThrow(
      "device not found in duplicated track",
    );

    // Should still delete the temp track after error
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("deletes the temp track when the move fails", async () => {
    // duplicate_track parks a full copy of the source track — devices, clips
    // and all — next to it. A throw between that and the cleanup leaked one
    // per failed call, and they accumulated.
    const { liveSet } = setupDeviceDuplicationMocks();

    vi.mocked(moveDeviceToPathMock).mockImplementationOnce(() => {
      throw new Error("nope");
    });

    await expect(
      duplicate({ type: "device", id: "device1", toPath: "t2/d0" }),
    ).rejects.toThrow("nope");

    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("fails, in the caller's coordinates, when the destination does not exist", async () => {
    // Without this the temp device's id came back as a success, for a device
    // that the cleanup was about to delete.
    const { liveSet } = setupDeviceDuplicationMocks();

    vi.mocked(moveDeviceToPathMock).mockReturnValueOnce(false);

    // The path handed to the move is t100 (shifted past the temp track); the
    // error names the t99 the caller sent.
    await expect(
      duplicate({ type: "device", id: "device1", toPath: "t99" }),
    ).rejects.toThrow('duplicate failed: no destination at toPath "t99"');

    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t100",
      expect.anything(),
    );
    expect(liveSet.call).toHaveBeenCalledWith("delete_track", 1);
  });

  it("reads a blank toPath as omitted, the way clips do", async () => {
    setupDeviceDuplicationMocks(1);

    const result = await duplicate({
      type: "device",
      id: "device1",
      toPath: "",
    });

    expect(result).toStrictEqual({ id: "live_set/tracks/1/devices/1" });
    // Omitted means "after the original on the source track".
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t0/d2",
      expect.anything(),
    );
  });

  it("refuses a toPath that was sent but names nothing", async () => {
    const { liveSet } = setupDeviceDuplicationMocks();

    await expect(
      duplicate({ type: "device", id: "device1", toPath: "," }),
    ).rejects.toThrow('invalid toPath "," - it names no destination');

    // Refused before anything was created.
    expect(liveSet.call).not.toHaveBeenCalledWith(
      "duplicate_track",
      expect.anything(),
    );
  });

  it("trims a single toPath instead of forwarding it raw", async () => {
    setupDeviceDuplicationMocks(1);

    await duplicate({ type: "device", id: "device1", toPath: "  t2/d0  " });

    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t3/d0",
      expect.anything(),
    );
  });

  it("should not adjust non-track destination path (return/master)", async () => {
    setupDeviceDuplicationMocks();

    // Using a path that doesn't start with "t" should not be adjusted
    await duplicate({ type: "device", id: "device1", toPath: "r0/d0" });

    // Should pass the path through unchanged (return track)
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "r0/d0",
      expect.anything(),
    );
  });

  it("should throw error for invalid device path without device segment", async () => {
    // Path with track but no device segment - triggers extractDevicePathWithinTrack error
    registerMockObject("device1", {
      path: livePath.track(0),
      type: "PluginDevice",
    });

    await expect(duplicate({ type: "device", id: "device1" })).rejects.toThrow(
      "cannot extract device path",
    );
  });

  it("should duplicate a device to multiple toPath destinations", async () => {
    setupDeviceDuplicationMocks(1);

    const result = await duplicate({
      type: "device",
      id: "device1",
      toPath: "t2/d0, t3/d0",
    });

    // Should call duplicateDevice twice (once per path)
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("should duplicate a device from a multi-digit source track index", async () => {
    // extractRegularTrackIndex / extractDevicePathWithinTrack read the track
    // index with \d+; a \d-only match would read "12" as "1" and look for the
    // temp device on the wrong track, throwing "device not found".
    registerMockObject("device1", {
      path: livePath.track(12).device(0),
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("live_set/tracks/13/devices/0", {
      path: livePath.track(13).device(0),
    });

    const result = await duplicate({ type: "device", id: "device1" });

    expect(result).toStrictEqual({ id: "live_set/tracks/13/devices/0" });
    // Default destination places the copy after the original on the source track.
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t12/d1",
      expect.anything(),
    );
  });

  it("should adjust a multi-digit destination track index after the source", async () => {
    // adjustTrackIndicesForTempTrack matches and rewrites the destination track
    // with \d+; a \d-only match would mangle "t12" into "t2"/"t132".
    registerMockObject("device1", {
      path: livePath.track(0).device(0),
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("live_set/tracks/1/devices/0", {
      path: livePath.track(1).device(0),
    });

    await duplicate({ type: "device", id: "device1", toPath: "t12/d0" });

    // Temp track inserted at index 1 shifts t12 → t13.
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t13/d0",
      expect.anything(),
    );
  });

  it("should handle device path ending with chain segment (not device)", async () => {
    // When extractDevicePath returns a path that ends with a chain (not device),
    // it should use the fallback of returning the simplified path as-is
    // This tests the "return simplifiedPath" fallback in calculateDefaultDestination
    registerMockObject("device1", {
      path: livePath.track(0).device(0).chain(0),
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("live_set/tracks/1/devices/0/chains/0", {
      path: livePath.track(1).device(0).chain(0),
    });

    const result = await duplicate({ type: "device", id: "device1" });

    expect(result).toBeDefined();
    // When last segment is "c0" (not "d"), use the simplified path as destination
    expect(moveDeviceToPathMock).toHaveBeenCalledWith(
      expect.anything(),
      "t0/d0/c0",
      expect.anything(),
    );
  });
});
