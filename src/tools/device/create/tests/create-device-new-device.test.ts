// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `d+` says "append" out loud, so a caller never has to count the devices
// already in a chain to add one past them.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { createDevice } from "../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

const TRACK = livePath.track(0);
const RACK = TRACK.device(0);

/**
 * Register a track whose device 0 is a rack with one chain. Both the track and
 * the chain take an insert, and the device it makes lands past what is there.
 * @returns The track and chain mocks
 */
function registerTrackWithRack(): {
  track: RegisteredMockObject;
  chain: RegisteredMockObject;
} {
  const track = registerMockObject("track-0", {
    path: TRACK,
    type: "Track",
    properties: { devices: ["id", "rack"] },
    methods: { insert_device: () => ["id", "track-device"] },
  });

  registerMockObject("track-device", { path: TRACK.device(1) });
  registerMockObject("rack", {
    path: RACK,
    type: "RackDevice",
    properties: {
      chains: ["id", "chain-0"],
      can_have_chains: 1,
      can_have_drum_pads: 0,
    },
  });

  const chain = registerMockObject("chain-0", {
    path: RACK.chain(0),
    type: "Chain",
    properties: { devices: ["id", "chain-device-0"] },
    methods: { insert_device: () => ["id", "chain-device-1"] },
  });

  registerMockObject("chain-device-0", { path: RACK.chain(0).device(0) });
  registerMockObject("chain-device-1", { path: RACK.chain(0).device(1) });

  return { track, chain };
}

describe("createDevice — d+ appends a device", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("appends to a track, leaving the position to Live", () => {
    const { track } = registerTrackWithRack();

    expect(createDevice({ deviceName: "Reverb", path: "t0/d+" })).toStrictEqual(
      { id: "track-device", path: "t0/d1" },
    );
    // No index: Live puts it at the end of the section for its device type.
    expect(track.call).toHaveBeenCalledWith("insert_device", "Reverb");
  });

  it("appends to a rack chain", () => {
    const { chain } = registerTrackWithRack();

    expect(
      createDevice({ deviceName: "Reverb", path: "t0/d0/c0/d+" }),
    ).toStrictEqual({ id: "chain-device-1", path: "t0/d0/c0/d1" });
    expect(chain.call).toHaveBeenCalledWith("insert_device", "Reverb");
  });

  // The bare container appended before `d+` existed, and still does.
  it("does the same as the bare container path", () => {
    const { track } = registerTrackWithRack();

    expect(createDevice({ deviceName: "Reverb", path: "t0" })).toStrictEqual(
      createDevice({ deviceName: "Reverb", path: "t0/d+" }),
    );
    expect(
      track.call.mock.calls.filter(([method]) => method === "insert_device"),
    ).toStrictEqual([
      ["insert_device", "Reverb"],
      ["insert_device", "Reverb"],
    ]);
  });

  it("makes one device per entry in a list", () => {
    registerTrackWithRack();

    expect(
      createDevice({ deviceName: "Reverb", path: "t0/d+,t0/d0/c0/d+" }),
    ).toStrictEqual([
      { id: "track-device", path: "t0/d1" },
      { id: "chain-device-1", path: "t0/d0/c0/d1" },
    ]);
  });
});
