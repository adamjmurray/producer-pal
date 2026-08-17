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

const OUTER_CHAIN = `${livePath.track(1).device(0)} chains 0`;
const SUB_RACK = `${OUTER_CHAIN} devices 0`;
const SUB_CHAIN = `${SUB_RACK} chains 0`;

/**
 * Build a Drum Rack whose C1 pad holds another Drum Rack, itself holding a
 * Simpler on its C3 pad — reachable at "t1/d0/pC1/c0/d0/pC3/c0/d0".
 */
function setupNestedDrumRack(): void {
  setupDrumPadMocks({
    padIds: ["pad-36"],
    padProperties: {
      "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
    },
    chainProperties: {
      "chain-1": { name: "Sub Kit", in_note: 36, deviceIds: ["sub-rack"] },
    },
  });

  // Re-register the outer rack with what a tree walk needs: a device type, and
  // its drum chains under `chains` (setupDrumPadMocks only wires drum_pads).
  registerMockObject("drum-rack-1", {
    path: livePath.track(1).device(0),
    type: "Device",
    properties: {
      name: "Kit",
      class_display_name: "Drum Rack",
      type: 1,
      can_have_chains: 1,
      can_have_drum_pads: 1,
      is_active: 1,
      drum_pads: children("pad-36"),
      chains: children("chain-1"),
    },
  });

  registerMockObject("sub-rack", {
    path: SUB_RACK,
    type: "Device",
    properties: {
      name: "Sub Kit",
      class_display_name: "Drum Rack",
      type: 1,
      can_have_chains: 1,
      can_have_drum_pads: 1,
      is_active: 1,
      drum_pads: children("sub-pad-60"),
      chains: children("sub-chain"),
    },
  });

  registerMockObject("sub-pad-60", {
    path: `${SUB_RACK} drum_pads 60`,
    type: "DrumPad",
    properties: { note: 60, name: "Hat", chains: children("sub-chain") },
  });

  registerMockObject("sub-chain", {
    path: SUB_CHAIN,
    type: "DrumChain",
    properties: {
      name: "Hat",
      in_note: 60,
      out_note: 60,
      devices: children("sub-device"),
    },
  });

  registerMockObject("sub-device", {
    path: `${SUB_CHAIN} devices 0`,
    type: "Device",
    properties: {
      name: "synth-hat",
      class_display_name: "Simpler",
      type: 1,
      is_active: 1,
    },
  });
}

// A path can pass through more than one drum pad. The segments after the first
// pad's device used to be dropped, so a read of a nested pad answered with the
// rack holding it — under the path that was asked for, so it looked right.
describe("readDevice - paths through a nested drum rack", () => {
  it("reads the device inside the nested rack's pad", () => {
    setupNestedDrumRack();

    expect(readDevice({ path: "t1/d0/pC1/c0/d0/pC3/c0/d0" })).toStrictEqual({
      id: "sub-device",
      path: "t1/d0/pC1/c0/d0/pC3/c0/d0",
      type: "instrument: Simpler",
      name: "synth-hat",
    });
  });

  it("reads the nested rack's pad chain", () => {
    setupNestedDrumRack();

    const result = readDevice({ path: "t1/d0/pC1/c0/d0/pC3/c0" });

    expect(result.id).toBe("sub-chain");
    expect(result.path).toBe("t1/d0/pC1/c0/d0/pC3/c0");
    expect(result.type).toBe("DrumChain");
  });

  it("still reads the nested rack itself", () => {
    setupNestedDrumRack();

    const result = readDevice({ path: "t1/d0/pC1/c0/d0" });

    expect(result.id).toBe("sub-rack");
    expect(result.type).toBe("drum-rack");
  });

  it("throws instead of answering with the wrong object for an unreachable pad", () => {
    setupNestedDrumRack();

    expect(() => readDevice({ path: "t1/d0/pC1/c0/d0/pD3/c0/d0" })).toThrow(
      "Invalid path: t1/d0/pC1/c0/d0/pD3/c0/d0",
    );
  });

  it("reports the nested pad path in pad notation, not raw chain indexes", () => {
    setupNestedDrumRack();

    const result = readDevice({
      path: "t1/d0",
      include: ["drum-pads", "chains"],
      maxDepth: 2,
    });

    const outerPad = (
      result.drumPads as { chains: { devices: unknown[] }[] }[]
    )[0];
    const subRack = outerPad?.chains[0]?.devices[0] as {
      drumPads?: { chains?: { path: string }[] }[];
    };

    expect(subRack.drumPads?.[0]?.chains?.[0]?.path).toBe(
      "t1/d0/pC1/c0/d0/pC3/c0",
    );
  });
});
