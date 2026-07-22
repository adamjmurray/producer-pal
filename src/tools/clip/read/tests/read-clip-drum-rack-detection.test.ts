// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { isDrumRackTrack } from "#src/tools/clip/read/helpers/read-clip-helpers.ts";

/**
 * Register the track-0 object with the given top-level device children.
 * @param deviceIds - Mock ids of the track's top-level devices
 */
function registerTrackWithDevices(...deviceIds: string[]): void {
  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { devices: children(...deviceIds) },
  });
}

/**
 * Register a Drum Rack device (can_have_drum_pads > 0).
 * @param id - Mock id for the device
 */
function registerDrumRack(id: string): void {
  registerMockObject(id, {
    type: "Device",
    properties: { can_have_drum_pads: 1 },
  });
}

/**
 * Register a plain (non-rack) instrument device.
 * @param id - Mock id for the device
 */
function registerInstrument(id: string): void {
  registerMockObject(id, {
    type: "Device",
    properties: { can_have_drum_pads: 0, can_have_chains: 0 },
  });
}

/**
 * Register a rack device (can_have_chains > 0) whose chains each hold the given
 * device children. Each entry in `chainDevices` becomes one chain.
 * @param id - Mock id for the rack device
 * @param chainDevices - Per-chain lists of device mock ids
 */
function registerRack(id: string, chainDevices: string[][]): void {
  const chainIds = chainDevices.map((_, i) => `${id}-chain-${i}`);

  registerMockObject(id, {
    type: "Device",
    properties: {
      can_have_drum_pads: 0,
      can_have_chains: 1,
      chains: children(...chainIds),
    },
  });

  for (const [i, chainId] of chainIds.entries()) {
    registerMockObject(chainId, {
      type: "Chain",
      properties: { devices: children(...(chainDevices[i] as string[])) },
    });
  }
}

describe("isDrumRackTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("detects a top-level Drum Rack", () => {
    registerTrackWithDevices("drumRack");
    registerDrumRack("drumRack");

    expect(isDrumRackTrack(0)).toBe(true);
  });

  it("detects a Drum Rack nested inside an Instrument Rack", () => {
    registerTrackWithDevices("instRack");
    registerRack("instRack", [["drumRack"]]);
    registerDrumRack("drumRack");

    expect(isDrumRackTrack(0)).toBe(true);
  });

  it("detects a Drum Rack nested two rack levels deep", () => {
    registerTrackWithDevices("outerRack");
    registerRack("outerRack", [["innerRack"]]);
    registerRack("innerRack", [["drumRack"]]);
    registerDrumRack("drumRack");

    expect(isDrumRackTrack(0)).toBe(true);
  });

  it("detects a Drum Rack in a non-first chain of an Instrument Rack", () => {
    registerTrackWithDevices("instRack");
    registerRack("instRack", [["melodicInst"], ["drumRack"]]);
    registerInstrument("melodicInst");
    registerDrumRack("drumRack");

    expect(isDrumRackTrack(0)).toBe(true);
  });

  it("detects a Drum Rack when a MIDI effect precedes the rack", () => {
    registerTrackWithDevices("midiEffect", "instRack");
    registerInstrument("midiEffect");
    registerRack("instRack", [["drumRack"]]);
    registerDrumRack("drumRack");

    expect(isDrumRackTrack(0)).toBe(true);
  });

  it("returns false for a plain melodic instrument", () => {
    registerTrackWithDevices("melodicInst");
    registerInstrument("melodicInst");

    expect(isDrumRackTrack(0)).toBe(false);
  });

  it("returns false for an Instrument Rack with only melodic instruments", () => {
    registerTrackWithDevices("instRack");
    registerRack("instRack", [["melodicA"], ["melodicB"]]);
    registerInstrument("melodicA");
    registerInstrument("melodicB");

    expect(isDrumRackTrack(0)).toBe(false);
  });

  it("returns false for a track with no devices", () => {
    registerTrackWithDevices();

    expect(isDrumRackTrack(0)).toBe(false);
  });
});
