// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `c+` appends a chain and loads the device into it, so the caller never has to
// read the rack to find out how many chains it already had.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "../create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

const RACK = livePath.track(0).device(0);

/**
 * Register a rack on track 0 whose insert_chain appends a real chain, ready to
 * take a device.
 * @param drum - Whether the rack is a Drum Rack
 * @param inNotes - in_note per chain already on it
 * @returns The rack mock
 */
function registerRack(
  drum: boolean,
  inNotes: number[] = [],
): {
  rack: RegisteredMockObject;
  chainIds: string[];
} {
  const chainIds: string[] = [];

  registerMockObject("track-0", { path: livePath.track(0) });

  /**
   * Register one chain, and the device an insert into it would make.
   * @param inNote - The chain's in_note, for a drum chain
   * @returns The chain's id
   */
  function addChain(inNote: number): string {
    const index = chainIds.length / 2;
    const id = `chain-${index}`;
    const chain = registerMockObject(id, {
      path: RACK.chain(index),
      type: drum ? "DrumChain" : "Chain",
      properties: { devices: children(), ...(drum ? { in_note: inNote } : {}) },
      methods: { insert_device: () => ["id", `device-${index}`] },
    });

    chain.set.mockImplementation((property: string, value: unknown) => {
      chain.properties[property] = value;
    });
    registerMockObject(`device-${index}`, {
      path: RACK.chain(index).device(0),
    });
    chainIds.push("id", id);

    return id;
  }

  for (const inNote of inNotes) {
    addChain(inNote);
  }

  const rack = registerMockObject("rack", {
    path: RACK,
    type: "RackDevice",
    properties: {
      chains: chainIds,
      can_have_chains: 1,
      can_have_drum_pads: drum ? 1 : 0,
    },
    // A Drum Rack appends on the catch-all pad; the caller moves it to a note.
    methods: { insert_chain: () => ["id", addChain(-1)] },
  });

  return { rack, chainIds };
}

describe("createDevice — c+ appends a chain", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("makes a chain past the last one and reports the index it landed at", async () => {
    const { rack } = registerRack(false, [0, 0]);

    expect(
      await createDevice({ deviceName: "Simpler", path: "t0/d0/c+" }),
    ).toStrictEqual({ id: "device-2", path: "t0/d0/c2/d0" });
    expect(rack.call).toHaveBeenCalledWith("insert_chain");
  });

  it("makes one chain per entry in a list", async () => {
    const { rack } = registerRack(false, [0]);

    expect(
      await createDevice({ deviceName: "Simpler", path: "t0/d0/c+,t0/d0/c+" }),
    ).toStrictEqual([
      { id: "device-1", path: "t0/d0/c1/d0" },
      { id: "device-2", path: "t0/d0/c2/d0" },
    ]);
    expect(
      rack.call.mock.calls.filter(([method]) => method === "insert_chain"),
    ).toHaveLength(2);
  });

  // A brand-new Drum Rack chain lands on the catch-all pad, which sounds on
  // every note no pad claims — never what "another chain" means.
  it("refuses a Drum Rack and names the pad spelling instead", async () => {
    registerRack(true, [36]);

    await expect(
      createDevice({ deviceName: "Simpler", path: "t0/d0/c+" }),
    ).rejects.toThrow('name the pad instead (e.g. "t0/d0/pC1/c+")');
  });

  it("adds a layer to a drum pad, which owns chains of its own", async () => {
    const { rack } = registerRack(true, [36]);

    expect(
      await createDevice({ deviceName: "Simpler", path: "t0/d0/pC1/c+" }),
    ).toStrictEqual({ id: "device-1", path: "t0/d0/pC1/c1/d0" });
    expect(rack.call).toHaveBeenCalledWith("insert_chain");
  });
});
