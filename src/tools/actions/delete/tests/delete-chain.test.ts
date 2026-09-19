// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Live has no chain delete, so a drum chain is removed by parking it on an
// unused pad and clearing that pad. These cover the borrow and everything it
// can't reach.

import { beforeEach, describe, expect, it, vi } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "../delete.ts";

const RACK_PATH = String(livePath.track(0).device(0));

interface RackMocks {
  chains: RegisteredMockObject[];
  pads: Map<number, RegisteredMockObject>;
}

/**
 * Register a Drum Rack on t0/d0 whose chains sit on the given notes.
 * @param inNotes - The in_note of each chain, in rack order
 * @param padNotes - Which pads the rack has (default: the C1 row)
 * @returns The chains and the pads, keyed by note
 */
function registerDrumRack(
  inNotes: number[],
  padNotes: number[] = [36, 37, 38, 39],
): RackMocks {
  const chainIds = inNotes.map((_, index) => `chain-${index}`);
  const padIds = padNotes.map((note) => `pad-${note}`);

  registerMockObject("drum-rack", {
    path: RACK_PATH,
    type: "RackDevice",
    properties: {
      can_have_drum_pads: 1,
      chains: children(...chainIds),
      drum_pads: children(...padIds),
    },
  });

  const chains = chainIds.map((id, index) =>
    registerMockObject(id, {
      path: livePath.track(0).device(0).chain(index),
      type: "DrumChain",
      properties: { in_note: inNotes[index] },
    }),
  );

  const pads = new Map(
    padNotes.map((note) => [
      note,
      registerMockObject(`pad-${note}`, {
        path: livePath.track(0).device(0).drumPad(note),
        type: "DrumPad",
        properties: { note },
      }),
    ]),
  );

  return { chains, pads };
}

describe("deleteObject chain deletion", () => {
  beforeEach(() => {
    simulateMockDeletes();
  });

  it("parks the chain on an unused pad and clears that pad", () => {
    const { chains, pads } = registerDrumRack([36, 36]);

    const result = deleteObject({ id: "chain-1", type: "chain" });

    // 36 holds both chains, so 37 is the first pad free to borrow.
    expect(chains[1]?.set).toHaveBeenCalledWith("in_note", 37);
    expect(pads.get(37)?.call).toHaveBeenCalledWith("delete_all_chains");
    expect(pads.get(36)?.call).not.toHaveBeenCalledWith("delete_all_chains");
    expect(result).toStrictEqual({
      id: "chain-1",
      deletedPath: "t0/d0/pC1/c1",
      type: "chain",
    });
  });

  it("deletes one layer of a pad by path", () => {
    const { chains } = registerDrumRack([36, 36]);

    const result = deleteObject({ path: "t0/d0/pC1/c1", type: "chain" });

    expect(chains[1]?.set).toHaveBeenCalledWith("in_note", 37);
    expect(result).toStrictEqual({
      id: "chain-1",
      deletedPath: "t0/d0/pC1/c1",
      type: "chain",
    });
  });

  it("deletes the catch-all chain, which has no pad of its own", () => {
    const { chains, pads } = registerDrumRack([36, -1]);

    const result = deleteObject({ path: "t0/d0/p*/c0", type: "chain" });

    expect(chains[1]?.set).toHaveBeenCalledWith("in_note", 37);
    expect(pads.get(37)?.call).toHaveBeenCalledWith("delete_all_chains");
    expect(result).toStrictEqual({
      id: "chain-1",
      deletedPath: "t0/d0/p*/c0",
      type: "chain",
    });
  });

  it("refuses a bare pad path, which names the whole pad", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerDrumRack([36]);

    expect(() => deleteObject({ path: "t0/d0/pC1", type: "chain" })).toThrow(
      'path "t0/d0/pC1" names a whole drum pad; use type="drum-pad", ' +
        'or name one layer like "t0/d0/pC1/c0"',
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("refuses a chain that is not on a drum pad", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerMockObject("rack-chain", {
      path: livePath.track(0).device(0).chain(0),
      type: "Chain",
    });

    expect(() => deleteObject({ id: "rack-chain", type: "chain" })).toThrow(
      "chain t0/d0/c0 (id rack-chain) is not on a drum pad. Live has no way to " +
        `delete a rack chain, and only a drum pad's chains can be removed.`,
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("keeps a refused chain in its slot beside one it did delete", () => {
    const { chains } = registerDrumRack([36, 36]);

    registerMockObject("rack-chain", {
      path: livePath.track(0).device(0).chain(5),
      type: "Chain",
    });

    expect(
      deleteObject({ id: "rack-chain, chain-1", type: "chain" }),
    ).toStrictEqual([
      {
        id: "rack-chain",
        path: "t0/d0/c5",
        type: "chain",
        ok: false,
        reason:
          "chain t0/d0/c5 (id rack-chain) is not on a drum pad. Live has no way to " +
          `delete a rack chain, and only a drum pad's chains can be removed.`,
      },
      { id: "chain-1", deletedPath: "t0/d0/pC1/c1", type: "chain" },
    ]);
    expect(chains[1]?.set).toHaveBeenCalledWith("in_note", 37);
  });

  it("refuses a rack return chain", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerMockObject("drum-rack", { path: RACK_PATH, type: "RackDevice" });
    registerMockObject("return-chain", {
      path: livePath.track(0).device(0).returnChain(0),
      type: "Chain",
    });

    expect(() => deleteObject({ path: "t0/d0/rc0", type: "chain" })).toThrow(
      /chain t0\/d0\/rc0 \(id return-chain\) is not on a drum pad/,
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("refuses a chain in a rack that has no pads of its own", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerDrumRack([36], []);

    expect(() => deleteObject({ id: "chain-0", type: "chain" })).toThrow(
      "chain t0/d0/pC1/c0 (id chain-0) needs a free drum pad to move to, and its " +
        "Drum Rack has none — a rack nested in a drum pad has no pads at all. " +
        "Live offers no other way to remove it; delete its devices to empty " +
        "the pad, or move it with update-device's toPath.",
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("puts the chain back when Live refuses the clear", () => {
    const consoleSpy = vi.spyOn(console, "warn");
    const { chains } = registerDrumRack([36]);

    // A pad whose clear does nothing: the chain survives on the scratch pad.
    registerMockObject("pad-37", {
      path: livePath.track(0).device(0).drumPad(37),
      type: "DrumPad",
      properties: { note: 37 },
      methods: { delete_all_chains: () => null },
    });

    expect(() => deleteObject({ id: "chain-0", type: "chain" })).toThrow(
      "Live did not remove chain t0/d0/pC1/c0 (id chain-0), so it was left as is",
    );
    expect(chains[0]?.set).toHaveBeenCalledWith("in_note", 37);
    expect(chains[0]?.set).toHaveBeenCalledWith("in_note", 36);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("refuses a device path, saying what it found", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerMockObject("some-device", {
      path: livePath.track(0).device(1),
      type: "Device",
    });

    expect(() => deleteObject({ path: "t0/d1", type: "chain" })).toThrow(
      'path "t0/d1" resolves to device, not chain',
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("reports a rack chain path naming nothing as nothing to delete", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerMockObject("drum-rack", { path: RACK_PATH, type: "RackDevice" });
    mockNonExistentObjects();

    const result = deleteObject({ path: "t0/d0/c9", type: "chain" });

    expect(result).toStrictEqual({
      path: "t0/d0/c9",
      type: "chain",
      reason: "nothing to delete",
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("reports a pad layer path naming nothing as nothing to delete", () => {
    const consoleSpy = vi.spyOn(console, "warn");

    registerDrumRack([36]);

    const result = deleteObject({ path: "t0/d0/pC1/c9", type: "chain" });

    expect(result).toStrictEqual({
      path: "t0/d0/pC1/c9",
      type: "chain",
      reason: "nothing to delete",
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
