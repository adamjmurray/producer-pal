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
  keepsParamValue,
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
 * @param padNote - The pad's MIDI note
 * @returns The C1 DrumPad and its chains
 */
function registerDrumRack(
  chainCount: number,
  withPads = true,
  padNote = 36,
): RackMocks {
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
        properties: { note: padNote },
      })
    : null;

  const chains = chainIds.map((id, index) => {
    const chainPath = livePath.track(0).device(0).chain(index);
    const volume = registerMockObject(`volume-${index}`, {
      path: `${chainPath} mixer_device volume`,
      type: "DeviceParameter",
      properties: { display_value: 0 },
    });

    // Live snaps a gain write, so a result that echoed it gets caught.
    keepsParamValue(volume, -6.02);

    return registerMockObject(id, {
      path: chainPath,
      type: "DrumChain",
      properties: { in_note: 36, name: `Layer ${index}` },
    });
  });

  return { pad, chains };
}

describe("updateDevice - bare drum pad paths", () => {
  it("writes mute to the DrumPad rather than to each chain", () => {
    const { pad, chains } = registerDrumRack(2);

    const result = updateDevice({ path: "t0/d0/pC1", mute: "true" });

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
      chokeGroup: "3",
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

    // They were the whole call, so nothing landed on the pad.
    expect(() =>
      updateDevice({
        path: "t0/d0/pC1",
        gainDb: "-6",
        pan: "0.5",
        name: "Kick",
      }),
    ).toThrow(
      "the pad has 2 layers, so per-layer settings " +
        "(name, gainDb, pan) were skipped. Set them on t0/d0/pC1/c0, " +
        "t0/d0/pC1/c1.",
    );

    for (const chain of chains) {
      expect(chain.set).not.toHaveBeenCalledWith("name", "Kick");
    }

    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("keeps the pad's entry when something else did land", () => {
    registerDrumRack(2);

    expect(
      updateDevice({ path: "t0/d0/pC1", name: "Kick", mute: "true" }),
    ).toStrictEqual({
      id: "pad-36",
      reason:
        "the pad has 2 layers, so per-layer settings (name) were skipped. " +
        "Set them on t0/d0/pC1/c0, t0/d0/pC1/c1.",
    });
  });

  it("applies the per-layer settings when the pad holds one chain", () => {
    const { chains } = registerDrumRack(1);

    const result = updateDevice({
      path: "t0/d0/pC1",
      gainDb: "-6",
      name: "Kick",
    });

    expect(chains[0]?.set).toHaveBeenCalledWith("name", "Kick");
    // The chain's mixer report rides along, so a single-layer pad says what
    // Live kept the same way a chain path does.
    expect(result).toStrictEqual({
      id: "pad-36",
      chainIds: ["chain-0"],
      gainDb: -6.02,
      reason: "gainDb read back as shown, not as sent",
    });
  });

  it("omits the id for a virtual pad and writes mute to the chains", () => {
    const { chains } = registerDrumRack(2, false);

    const result = updateDevice({ path: "t0/d0/pC1", mute: "true" });

    for (const chain of chains) {
      expect(chain.set).toHaveBeenCalledWith("mute", 1);
    }

    // No `id` is how a caller learns this pad can't be named by id — a Drum
    // Rack nested in a drum pad has chains grouped by in_note, but no pads.
    expect(result).toStrictEqual({ chainIds: ["chain-0", "chain-1"] });
  });

  it("refuses a pad with no chains, by path as well as by id", () => {
    const { pad } = registerDrumRack(0);

    // Live drops the write — set returns 1 and the read-back stays 0 — so a
    // result here would say a mute happened that didn't.
    expect(() => updateDevice({ path: "t0/d0/pC1", mute: "true" })).toThrow(
      "drum pad t0/d0/pC1 (id pad-36) has no chains, so there is nothing " +
        "to update — Live ignores writes to an empty pad",
    );
    expect(pad?.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // A sample is the one write that makes an empty pad's chain, so these cover
  // what happens when it can't.
  it("refuses an empty pad Live gives no note for", () => {
    // Addressed by id, so nothing has checked the pad's note: 200 is outside
    // the MIDI range, and a chain made on no note would sound nowhere.
    registerDrumRack(0, true, 200);

    expect(() =>
      updateDevice({
        id: "pad-36",
        params: [{ name: "sample", value: "/tmp/kick.wav" }],
      }),
    ).toThrow("has no chains, so there is nothing to update");
  });

  it("refuses an empty pad Live makes no chain on", () => {
    // The rack answers nothing to insert_chain, so the pad is still empty and
    // the sample has nowhere to land.
    registerDrumRack(0);

    expect(() =>
      updateDevice({
        path: "t0/d0/pC1",
        params: [{ name: "sample", value: "/tmp/kick.wav" }],
      }),
    ).toThrow("has no chains, so there is nothing to update");
  });

  // The rack's return chains belong to the rack, so a send naming none is a
  // fact about the pad the call named — its own entry says it (ADR-0042).
  it("reports a send naming no return chain on the pad's entry", () => {
    registerDrumRack(1);

    const result = updateDevice({
      path: "t0/d0/pC1",
      sends: [{ return: "Nope", gainDb: -6 }],
    }) as { sends?: unknown[] };

    expect(result.sends).toStrictEqual([
      {
        return: "Nope",
        ok: false,
        reason:
          'no return chain matching "Nope" (rack has no return chains; they can only be added in Live)',
      },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  // Once for the pad, not once per layer: the first chain carries the full
  // options and the rest only take what broadcasts.
  it("names a device-only property once for the whole pad", () => {
    registerDrumRack(2);

    expect(() => updateDevice({ path: "t0/d0/pC1", macroCount: "4" })).toThrow(
      "macroCount not applicable to a drum pad chain",
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });
});
