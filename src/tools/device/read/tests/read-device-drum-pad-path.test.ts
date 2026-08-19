// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "../read-device.ts";
import { setupDrumPadMocks } from "./read-device-drum-mocks.ts";

/** Simpler device props reused across tests */
const simplerDevice = {
  name: "Simpler",
  class_display_name: "Simpler",
  type: 1,
};

/** The C1 "Layer 1" DrumChain result (spread with a `devices` array per test). */
const LAYER1_CHAIN = {
  id: "chain-1",
  path: "t1/d0/pC1/c0",
  type: "DrumChain",
  name: "Layer 1",
  color: "#00FF00",
  mappedPitch: "C3",
};

/**
 * Setup drum pad mocks with a standard C1/Kick pad and optional chain/device config.
 * @param overrides - Optional pad property overrides and chain/device config
 * @param overrides.padExtra - Extra properties to merge into the pad-36 config
 * @param overrides.chainProperties - Chain properties keyed by chain ID
 * @param overrides.deviceProperties - Device properties keyed by device ID
 */
function setupKickPadMocks(
  overrides: {
    padExtra?: Record<string, unknown>;
    chainProperties?: Parameters<
      typeof setupDrumPadMocks
    >[0]["chainProperties"];
    deviceProperties?: Parameters<
      typeof setupDrumPadMocks
    >[0]["deviceProperties"];
  } = {},
) {
  setupDrumPadMocks({
    padIds: ["pad-36"],
    padProperties: {
      "pad-36": { note: 36, name: "Kick", ...overrides.padExtra },
    },
    chainProperties: overrides.chainProperties,
    deviceProperties: overrides.deviceProperties,
  });
}

/**
 * Setup the C1/Kick pad holding one chain ("Layer 1") that contains one Simpler
 * device, reachable at "t1/d0/pC1/c0/d0" (or "t1/d0/pC1/d0" via implicit chain).
 */
function setupKickPadWithChainDevice() {
  setupKickPadMocks({
    padExtra: { chainIds: ["chain-1"] },
    chainProperties: {
      "chain-1": { name: "Layer 1", deviceIds: ["device-1"] },
    },
    deviceProperties: { "device-1": simplerDevice },
  });
}

/**
 * Assert a read result is the "device-1" Simpler instrument.
 * @param result - The readDevice result to check
 */
function expectSimplerDeviceResult(result: Record<string, unknown>) {
  expect(result.id).toBe("device-1");
  expect(result.type).toBe("instrument: Simpler");
}

describe("readDevice with drum pad path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should read drum pad by path", () => {
    setupKickPadMocks();

    const result = readDevice({ path: "t1/d0/pC1", include: [] });

    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t1/d0/pC1",
      name: "Kick",
      note: 36,
      pitch: "C1",
    });
  });

  // Live's two chain lists disagree once a pad holds layers: a copied-on layer
  // comes first in the rack's `chains` and last in the pad's. Every path
  // resolves against the rack's, so reading the pad's would hand back paths
  // that address the other layer.
  it("numbers a layered pad's chains the way its paths resolve", () => {
    const rackPath = String(livePath.track(1).device(0));

    registerMockObject("drum-rack-1", {
      path: rackPath,
      type: "Device",
      properties: {
        can_have_drum_pads: 1,
        drum_pads: children("pad-36"),
        chains: children("layer-a", "layer-b"),
      },
    });
    registerMockObject("pad-36", {
      path: `${rackPath} drum_pads 36`,
      type: "DrumPad",
      properties: {
        note: 36,
        name: "Multi",
        chains: children("layer-b", "layer-a"),
      },
    });

    for (const [index, id] of ["layer-a", "layer-b"].entries()) {
      registerMockObject(id, {
        path: `${rackPath} chains ${index}`,
        type: "DrumChain",
        properties: { name: id, in_note: 36, out_note: 36 },
      });
    }

    const result = readDevice({ path: "t1/d0/pC1", include: ["chains"] });
    const chains = result.chains as { id: string; path: string }[];

    expect(chains.map((c) => c.id)).toStrictEqual(["layer-a", "layer-b"]);
    expect(chains.map((c) => c.path)).toStrictEqual([
      "t1/d0/pC1/c0",
      "t1/d0/pC1/c1",
    ]);
    expect(readDevice({ path: "t1/d0/pC1/c1", include: [] }).id).toBe(
      "layer-b",
    );
  });

  it("should read muted drum pad", () => {
    setupKickPadMocks({ padExtra: { mute: 1 } });

    const result = readDevice({ path: "t1/d0/pC1", include: [] });

    expect(result.state).toBe("muted");
  });

  it("should read soloed drum pad", () => {
    setupKickPadMocks({ padExtra: { solo: 1 } });

    const result = readDevice({ path: "t1/d0/pC1", include: [] });

    expect(result.state).toBe("soloed");
  });

  it("should read drum pad with chains when includeChains is requested", () => {
    setupKickPadMocks({
      padExtra: { chainIds: ["chain-1"] },
      chainProperties: {
        "chain-1": {
          name: "Layer 1",
          color: 0xff0000,
          choke_group: 2,
          out_note: 48,
        },
      },
    });

    const result = readDevice({ path: "t1/d0/pC1", include: ["chains"] });

    const chains = result.chains as Record<string, unknown>[];

    expect(chains).toHaveLength(1);
    expect(chains[0]).toStrictEqual({
      id: "chain-1",
      path: "t1/d0/pC1/c0",
      type: "DrumChain",
      name: "Layer 1",
      color: "#FF0000",
      mappedPitch: "C2",
      chokeGroup: 2,
      devices: [],
    });
  });

  it("lists the chain's own trim when it is non-default", () => {
    setupKickPadMocks({
      padExtra: { chainIds: ["chain-1"] },
      chainProperties: { "chain-1": { name: "Layer 1", out_note: 48 } },
    });

    const mixerPath = `${livePath.track(1).device(0)} chains 0 mixer_device`;

    registerMockObject("mixer-1", { path: mixerPath });
    registerMockObject("volume-1", {
      path: `${mixerPath} volume`,
      properties: { display_value: -15 },
    });
    registerMockObject("panning-1", {
      path: `${mixerPath} panning`,
      properties: { value: 0.25 },
    });

    const result = readDevice({ path: "t1/d0/pC1", include: ["chains"] });
    const chains = result.chains as Record<string, unknown>[];

    expect(chains[0]).toStrictEqual({
      id: "chain-1",
      path: "t1/d0/pC1/c0",
      type: "DrumChain",
      name: "Layer 1",
      mappedPitch: "C2",
      gainDb: -15,
      pan: 0.25,
      devices: [],
    });
  });

  it("names a drum chain's sends after the rack's return chains", () => {
    // The send names come from walking up the chain path to its rack. A drum
    // chain sits at "<rack> chains N", so that walk only lands on the rack when
    // the path is right — the reason this test exists.
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: { "pad-36": { note: 36, chainIds: ["chain-1"] } },
      chainProperties: { "chain-1": { name: "Layer 1", out_note: 48 } },
      returnChainNames: ["A Reverb", "B Delay"],
    });

    const mixerPath = `${livePath.track(1).device(0)} chains 0 mixer_device`;

    registerMockObject("mixer-1", {
      path: mixerPath,
      properties: { sends: children("send-0", "send-1") },
    });
    registerMockObject("send-0", { properties: { value: 0 } });
    registerMockObject("send-1", {
      properties: { value: 0.5, display_value: -9 },
    });

    const result = readDevice({ path: "t1/d0/pC1", include: ["chains"] });
    const chains = result.chains as Record<string, unknown>[];

    // Only the send that is turned up is listed, named after return chain B.
    expect(chains[0]!.sends).toStrictEqual([{ return: "B Delay", gainDb: -9 }]);
  });

  it("should read drum pad with chains containing devices", () => {
    setupKickPadMocks({
      padExtra: { chainIds: ["chain-1"] },
      chainProperties: {
        "chain-1": {
          name: "Layer 1",
          color: 0xff0000,
          out_note: 48,
          deviceIds: ["device-1"],
        },
      },
      deviceProperties: { "device-1": simplerDevice },
    });

    const result = readDevice({ path: "t1/d0/pC1", include: ["chains"] });

    const chains = result.chains as Array<Record<string, unknown>>;

    expect(chains).toHaveLength(1);
    const devices = chains[0]!.devices as Array<Record<string, unknown>>;

    expect(devices).toHaveLength(1);
    expect(devices[0]).toStrictEqual({
      id: "device-1",
      path: "t1/d0/pC1/c0/d0",
      type: "instrument: Simpler",
    });
  });

  it("should read drum pad chain by path", () => {
    setupKickPadMocks({
      padExtra: { chainIds: ["chain-1"] },
      chainProperties: {
        "chain-1": { name: "Layer 1", color: 0x00ff00, out_note: 60 },
      },
    });

    const result = readDevice({ path: "t1/d0/pC1/c0" });

    expect(result).toStrictEqual({ ...LAYER1_CHAIN, devices: [] });
  });

  it("should read drum pad chain with devices", () => {
    setupKickPadMocks({
      padExtra: { chainIds: ["chain-1"] },
      chainProperties: {
        "chain-1": {
          name: "Layer 1",
          color: 0x00ff00,
          out_note: 60,
          deviceIds: ["device-1"],
        },
      },
      deviceProperties: { "device-1": simplerDevice },
    });

    const result = readDevice({ path: "t1/d0/pC1/c0" });

    expect(result).toStrictEqual({
      ...LAYER1_CHAIN,
      devices: [
        {
          id: "device-1",
          path: "t1/d0/pC1/c0/d0",
          type: "instrument: Simpler",
        },
      ],
    });
  });

  it("should throw error when drum pad not found", () => {
    setupKickPadMocks(); // C1, not C3

    expect(() => readDevice({ path: "t1/d0/pC3" })).toThrow(
      "Drum pad C3 not found",
    );
  });

  it("should throw error for invalid drum pad note name", () => {
    setupKickPadMocks();

    expect(() => readDevice({ path: "t1/d0/pXYZ" })).toThrow(
      /"pXYZ" names no drum pad/,
    );
  });

  // The catch-all is a chain with in_note -1, not a drum_pads entry, so there
  // is nothing here to find. read-device reads it through the rack instead.
  it("should report the catch-all pad as not found", () => {
    setupKickPadMocks();

    expect(() => readDevice({ path: "t1/d0/p*" })).toThrow(
      "Drum pad * not found",
    );
  });

  it("should throw error for invalid chain index in drum pad", () => {
    setupKickPadMocks({ padExtra: { chainIds: [] } });

    expect(() => readDevice({ path: "t1/d0/pC1/c5" })).toThrow(
      "Invalid chain index in path: t1/d0/pC1/c5",
    );
  });

  it("should throw for a chain index equal to the chain count (boundary)", () => {
    // One chain (index 0); "c1" is one past the end. Pins the `>=` bound: a `>`
    // mutant would fall through to an assertDefined error instead.
    setupKickPadMocks({ padExtra: { chainIds: ["chain-1"] } });

    expect(() => readDevice({ path: "t1/d0/pC1/c1" })).toThrow(
      "Invalid chain index in path: t1/d0/pC1/c1",
    );
  });

  it("should throw for a non-numeric chain segment", () => {
    // Segments past a drum pad are still segments: the grammar rejects "cX"
    // before any of this resolves against the rack.
    setupKickPadMocks({ padExtra: { chainIds: ["chain-1"] } });

    expect(() => readDevice({ path: "t1/d0/pC1/cX" })).toThrow(
      'invalid path "t1/d0/pC1/cX" - "cX" is not a device, chain, or drum pad',
    );
  });

  it("should read device inside drum pad chain", () => {
    setupKickPadWithChainDevice();

    const result = readDevice({ path: "t1/d0/pC1/c0/d0" });

    expectSimplerDeviceResult(result);
  });

  it("should read device inside drum pad with implicit chain (pC1/d0)", () => {
    setupKickPadWithChainDevice();

    // "pC1/d0" omits the chain segment; chain 0 is implied (== "pC1/c0/d0"),
    // matching the write-side pad-property shortcut.
    const result = readDevice({ path: "t1/d0/pC1/d0" });

    expectSimplerDeviceResult(result);
  });

  it("should throw error for invalid device index in drum pad chain", () => {
    setupKickPadMocks({
      padExtra: { chainIds: ["chain-1"] },
      chainProperties: { "chain-1": { name: "Layer 1", deviceIds: [] } },
    });

    expect(() => readDevice({ path: "t1/d0/pC1/c0/d5" })).toThrow(
      "Invalid device index in path: t1/d0/pC1/c0/d5",
    );
  });

  it("should throw for a device index equal to the device count (boundary)", () => {
    // One device (index 0); "d1" is one past the end (pins the `>=` bound).
    setupKickPadWithChainDevice();

    expect(() => readDevice({ path: "t1/d0/pC1/c0/d1" })).toThrow(
      "Invalid device index in path: t1/d0/pC1/c0/d1",
    );
  });

  it("should throw for a non-numeric device segment", () => {
    setupKickPadWithChainDevice();

    expect(() => readDevice({ path: "t1/d0/pC1/c0/dX" })).toThrow(
      'invalid path "t1/d0/pC1/c0/dX" - "dX" is not a device, chain, or drum pad',
    );
  });
});
