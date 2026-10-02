// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `device` pairs with `path` the way `name` does: one device for every path,
// or a comma-separated list naming one per path, in order.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({ warn: vi.fn() }));

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

/**
 * A track that takes an insert, and the device that insert returns.
 * @param index - Track index
 * @param deviceId - The id Live hands back for an insert on it
 * @returns The track mock
 */
function registerTrack(index: number, deviceId: string): RegisteredMockObject {
  const track = registerMockObject(`track-${String(index)}`, {
    path: livePath.track(index),
    methods: { insert_device: () => ["id", deviceId] },
  });

  registerMockObject(deviceId, { path: livePath.track(index).device(0) });

  return track;
}

describe("createDevice — a device per path", () => {
  let track0: RegisteredMockObject;
  let track1: RegisteredMockObject;

  beforeEach(() => {
    // No remote script answering, so only native names are valid.
    vi.mocked(requestNode).mockResolvedValue({
      success: true,
      result: { available: false },
    });

    track0 = registerTrack(0, "device0");
    track1 = registerTrack(1, "device1");
  });

  it("pairs a device list with the paths, in order", async () => {
    expect(
      await createDevice({ path: "t0,t1", device: "Compressor,Reverb" }),
    ).toStrictEqual([
      { id: "device0", path: "t0/d0" },
      { id: "device1", path: "t1/d0" },
    ]);
    expect(track0.call).toHaveBeenCalledWith("insert_device", "Compressor");
    expect(track1.call).toHaveBeenCalledWith("insert_device", "Reverb");
  });

  it("gives every path the same device when one is named", async () => {
    await createDevice({ path: "t0,t1", device: "Compressor" });

    expect(track0.call).toHaveBeenCalledWith("insert_device", "Compressor");
    expect(track1.call).toHaveBeenCalledWith("insert_device", "Compressor");
  });

  it("pairs the deprecated deviceName spelling too", async () => {
    await createDevice({ path: "t0,t1", deviceName: "Compressor,Reverb" });

    expect(track0.call).toHaveBeenCalledWith("insert_device", "Compressor");
    expect(track1.call).toHaveBeenCalledWith("insert_device", "Reverb");
  });

  // Nothing has been created yet, so refusing costs the caller only a retry.
  it("refuses a device list that doesn't match the paths", async () => {
    await expect(
      createDevice({ path: "t0,t1", device: "Compressor,Reverb,Delay" }),
    ).rejects.toThrow("path names 2 entries but device names 3 entries");
    expect(track0.call).not.toHaveBeenCalled();
  });

  it("refuses an empty entry in a device list", async () => {
    await expect(
      createDevice({ path: "t0,t1", device: "Compressor," }),
    ).rejects.toThrow("path names 2 entries but device names 1 entry");
  });

  it("refuses a hole in a device list", async () => {
    await expect(
      createDevice({ path: "t0,t1,t0", device: "Compressor,,Reverb" }),
    ).rejects.toThrow(
      'invalid device "Compressor,,Reverb" - it has an empty entry.',
    );
  });

  // One path has nothing to pair against, so its commas are all the name's.
  it("reads the whole value as one device name for a single path", async () => {
    await expect(
      createDevice({ path: "t0", device: "Compressor,Reverb" }),
    ).rejects.toThrow('invalid device "Compressor,Reverb"');
  });

  it("reads \\, as a comma in one device name for every path", async () => {
    await expect(
      createDevice({ path: "t0,t1", device: "Compressor\\,Reverb" }),
    ).rejects.toThrow('invalid device "Compressor,Reverb"');
  });

  it("pairs names against the same paths the devices did", async () => {
    const device0 = registerMockObject("device0", {
      path: livePath.track(0).device(0),
    });

    await createDevice({
      path: "t0,t1",
      device: "Compressor,Reverb",
      name: "Squash,Space",
    });

    expect(device0.set).toHaveBeenCalledWith("name", "Squash");
  });
});
