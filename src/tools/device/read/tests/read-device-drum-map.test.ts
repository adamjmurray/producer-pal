// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "../read-device.ts";
import { setupDrumPadMocks } from "./read-device-drum-mocks.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const DEVICE = livePath.track(1).device(0);
const CHAIN = `${DEVICE} chains 0`;
const KIT = `${CHAIN} devices 0`;

/**
 * Register a Drum Rack with one C1 pad holding a Simpler.
 * @param id - Device id
 * @param path - Live API path for the rack
 */
function registerKit(id: string, path: string): void {
  registerMockObject(id, {
    path,
    type: "Device",
    properties: {
      name: "Kit",
      class_display_name: "Drum Rack",
      type: 1,
      can_have_chains: 1,
      can_have_drum_pads: 1,
      is_active: 1,
      drum_pads: children(`${id}-pad`),
      chains: children(`${id}-chain`),
    },
  });

  registerMockObject(`${id}-pad`, {
    path: `${path} drum_pads 36`,
    type: "DrumPad",
    properties: { note: 36, name: "Kick", chains: children(`${id}-chain`) },
  });

  registerMockObject(`${id}-chain`, {
    path: `${path} chains 0`,
    type: "DrumChain",
    properties: {
      name: "Kick",
      in_note: 36,
      out_note: 36,
      devices: children(`${id}-device`),
    },
  });

  registerMockObject(`${id}-device`, {
    path: `${path} chains 0 devices 0`,
    type: "Device",
    properties: {
      name: "Kick",
      class_display_name: "Simpler",
      type: 1,
      is_active: 1,
    },
  });
}

/** A Drum Rack whose C1 pad holds a Simpler, reachable at "t1/d0/pC1". */
function setupKitPad(): void {
  setupDrumPadMocks({
    padIds: ["pad-36"],
    padProperties: {
      "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
    },
    chainProperties: {
      "chain-1": { name: "Kick", deviceIds: ["device-1"] },
    },
    deviceProperties: {
      "device-1": { name: "Kick", class_display_name: "Simpler", type: 1 },
    },
  });
}

/** An Instrument Rack whose chain holds a Drum Rack, at "t1/d0/c0/d0". */
function setupInstrumentRackWithKit(): void {
  registerMockObject("rack", {
    path: DEVICE,
    type: "Device",
    properties: {
      name: "Outer",
      class_display_name: "Instrument Rack",
      type: 1,
      can_have_chains: 1,
      is_active: 1,
      chains: children("chain-0"),
    },
  });

  registerMockObject("chain-0", {
    path: CHAIN,
    type: "Chain",
    properties: { name: "Kit", devices: children("kit") },
  });

  registerKit("kit", KIT);
}

const PAD_WARNING =
  "readDevice: a drum pad has no drum map of its own — read its drum rack for the kit's map";

describe("readDevice drum-map by target kind", () => {
  it('reads a drum pad with include: ["*"] instead of crashing', () => {
    setupKitPad();

    const result = readDevice({ path: "t1/d0/pC1", include: ["*"] });

    // The pad's own fields are the subject here; the chain tree under it has
    // its own tests, so only its length is pinned.
    expect(result).toStrictEqual({
      id: "pad-36",
      path: "t1/d0/pC1",
      name: "Kick",
      note: 36,
      pitch: "C1",
      chains: expect.any(Array),
    });
    expect(result.chains).toHaveLength(1);
    expect(capturedWarnings()).not.toContain(PAD_WARNING);
  });

  it("warns instead of mapping when drum-map is asked of a drum pad", () => {
    setupKitPad();

    const result = readDevice({ path: "t1/d0/pC1", include: ["drum-map"] });

    expect(result.drumMap).toBeUndefined();
    expect(capturedWarnings()).toContain(PAD_WARNING);
  });

  // A kit behind a pad only plays through that pad's note, so its pitches
  // aren't the ones to write — the same reason getDrumMap stops at the kit.
  it("gives no drum map for a kit nested under a pad", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: {
        "pad-36": { note: 36, name: "Sub Kit", chainIds: ["chain-1"] },
      },
      chainProperties: { "chain-1": { name: "Sub Kit", deviceIds: ["sub"] } },
    });
    registerKit("sub", `${DEVICE} chains 0 devices 0`);

    const result = readDevice({ path: "t1/d0/pC1", include: ["drum-map"] });

    expect(result.drumMap).toBeUndefined();
    expect(capturedWarnings()).toContain(PAD_WARNING);
  });

  it("warns instead of mapping when drum-map is asked of a drum chain", () => {
    setupKitPad();

    const result = readDevice({ path: "t1/d0/pC1/c0", include: ["drum-map"] });

    expect(result.drumMap).toBeUndefined();
    expect(capturedWarnings()).toContain(
      "readDevice: a drum chain has no drum map of its own — read its drum rack for the kit's map",
    );
  });

  it("maps a kit inside a plain chain and strips the tree it walked", () => {
    setupInstrumentRackWithKit();

    const result = readDevice({ path: "t1/d0/c0", include: ["drum-map"] });

    expect(result.drumMap).toStrictEqual({ C1: "Kick" });
    // The kit is a device down from the chain that was read, so the map names
    // where its pads live rather than leaving the caller to guess.
    expect(result.drumRackPath).toBe("t1/d0/c0/d0");

    const devices = result.devices as Record<string, unknown>[];

    expect(devices[0]).toStrictEqual({
      id: "kit",
      path: "t1/d0/c0/d0",
      type: "drum-rack",
      name: "Kit",
    });
  });

  // Regression: chains are forced on to build the map, and the strip that hides
  // them again deleted the pads outright — so asking for both returned neither
  // the pads nor a word about losing them. Adding "chains" made them reappear.
  it("keeps the pads when they were asked for alongside the map", () => {
    setupInstrumentRackWithKit();

    const result = readDevice({
      path: "t1/d0/c0",
      include: ["drum-map", "drum-pads"],
    });

    expect(result.drumMap).toStrictEqual({ C1: "Kick" });

    const kit = (result.devices as Record<string, unknown>[])[0];
    const pads = kit?.drumPads as Record<string, unknown>[];

    expect(pads).toHaveLength(1);
    // The pads read the same as they do without the map: their chains were
    // walked for the map, not asked for.
    expect(pads[0]).toStrictEqual({
      id: "kit-pad",
      // The kit is nested, so the pad's path runs through the outer rack.
      path: "t1/d0/c0/d0/pC1",
      name: "Kick",
      note: 36,
      pitch: "C1",
      chainCount: 1,
    });
    expect(kit?.chains).toBeUndefined();
  });

  // A pad path aimed at the rack that holds the kit is the miss models make, so
  // the refusal spells out where the pads actually are.
  it("points a pad path at the kit nested inside the rack it named", () => {
    setupInstrumentRackWithKit();

    expect(() => readDevice({ path: "t1/d0/pC1/c0/d0" })).toThrow(
      'Drum pad C1 not found — the drum rack is nested; try "t1/d0/c0/d0/pC1/c0/d0"',
    );
  });

  it("keeps the chain tree when chains were asked for too", () => {
    setupInstrumentRackWithKit();

    const result = readDevice({
      path: "t1/d0/c0",
      include: ["drum-map", "chains", "drum-pads"],
    });

    expect(result.drumMap).toStrictEqual({ C1: "Kick" });

    const devices = result.devices as Record<string, unknown>[];

    expect(devices[0]?.drumPads).toHaveLength(1);
  });
});
