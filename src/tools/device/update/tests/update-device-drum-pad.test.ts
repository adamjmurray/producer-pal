// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A bare pad path names the whole pad. These cover what that means once a pad
// holds more than one chain, and on a nested rack that has no DrumPad objects.

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  registerMockObject,
  updateDevice,
} from "./update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

interface RackMocks {
  pad: RegisteredMockObject | null;
  chains: RegisteredMockObject[];
}

/**
 * Register a drum rack on t0/d0 whose C1 pad holds `chainCount` chains.
 * @param chainCount - Chains stacked on C1
 * @param withPads - false builds a rack with no DrumPad objects (a virtual pad)
 * @returns The C1 DrumPad and its chains
 */
function registerDrumRack(chainCount: number, withPads = true): RackMocks {
  const chainIds = Array.from({ length: chainCount }, (_, i) => `chain-${i}`);

  registerMockObject("drumrack-id", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: {
      can_have_drum_pads: 1,
      chains: children(...chainIds),
      ...(withPads ? { drum_pads: children("pad-36") } : {}),
    },
  });

  const pad = withPads
    ? registerMockObject("pad-36", {
        type: "DrumPad",
        properties: { note: 36 },
      })
    : null;

  const chains = chainIds.map((id, index) =>
    registerMockObject(id, {
      path: livePath.track(0).device(0).chain(index),
      type: "DrumChain",
      properties: { in_note: 36, name: `Layer ${index}` },
    }),
  );

  return { pad, chains };
}

describe("updateDevice - bare drum pad paths", () => {
  it("writes mute to the DrumPad rather than to each chain", () => {
    const { pad, chains } = registerDrumRack(2);

    const result = updateDevice({ path: "t0/d0/pC1", mute: true });

    // Live broadcasts a pad's mute to its chains and reads it back aggregated,
    // so one write is both correct and what Live's own UI does.
    expect(pad?.set).toHaveBeenCalledWith("mute", 1);

    for (const chain of chains) {
      expect(chain.set).not.toHaveBeenCalledWith("mute", 1);
    }

    expect(result).toStrictEqual({ id: "pad-36" });
  });

  it("broadcasts chokeGroup and mappedPitch to every chain on the pad", () => {
    const { chains } = registerDrumRack(2);

    const result = updateDevice({
      path: "t0/d0/pC1",
      chokeGroup: 3,
      mappedPitch: "C3",
    });

    for (const chain of chains) {
      expect(chain.set).toHaveBeenCalledWith("choke_group", 3);
      expect(chain.set).toHaveBeenCalledWith("out_note", 60);
    }

    expect(result).toStrictEqual({
      id: "pad-36",
      chainIds: ["chain-0", "chain-1"],
    });
  });

  it("broadcasts color to every chain on the pad", () => {
    const { chains } = registerDrumRack(2);

    updateDevice({ path: "t0/d0/pC1", color: "#FF0000" });

    for (const chain of chains) {
      expect(chain.set).toHaveBeenCalledWith("color", 0xff0000);
    }
  });

  it("skips the per-layer settings on a stacked pad and names the chain paths", () => {
    const { chains } = registerDrumRack(2);

    updateDevice({ path: "t0/d0/pC1", gainDb: -6, pan: 0.5, name: "Kick" });

    expect(capturedWarnings()).toContain(
      'updateDevice: "t0/d0/pC1" has 2 layers, so per-layer settings ' +
        "(name, gainDb, pan) were skipped. Set them on t0/d0/pC1/c0, " +
        "t0/d0/pC1/c1.",
    );

    for (const chain of chains) {
      expect(chain.set).not.toHaveBeenCalledWith("name", "Kick");
    }
  });

  it("applies the per-layer settings when the pad holds one chain", () => {
    const { chains } = registerDrumRack(1);

    const result = updateDevice({
      path: "t0/d0/pC1",
      gainDb: -6,
      name: "Kick",
    });

    expect(chains[0]?.set).toHaveBeenCalledWith("name", "Kick");
    expect(result).toStrictEqual({ id: "pad-36", chainIds: ["chain-0"] });
  });

  it("omits the id for a virtual pad and writes mute to the chains", () => {
    const { chains } = registerDrumRack(2, false);

    const result = updateDevice({ path: "t0/d0/pC1", mute: true });

    for (const chain of chains) {
      expect(chain.set).toHaveBeenCalledWith("mute", 1);
    }

    // No `id` is how a caller learns this pad can't be named by id — a Drum
    // Rack nested in a drum pad has chains grouped by in_note, but no pads.
    expect(result).toStrictEqual({ chainIds: ["chain-0", "chain-1"] });
  });

  it("warns once, not once per layer, for a device-only property", () => {
    registerDrumRack(2);

    updateDevice({ path: "t0/d0/pC1", macroCount: 4 });

    expect(
      capturedWarnings().filter(
        (warning) =>
          warning === "updateDevice: 'macroCount' not applicable to DrumChain",
      ),
    ).toHaveLength(1);
  });
});
