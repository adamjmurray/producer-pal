// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  lookupMockObject,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  insertionContainerPath,
  resolveInsertionPath,
} from "../insertion-path.ts";

const RACK_PATH = "live_set tracks 0 devices 0";

interface RackOptions {
  /** in_note per existing chain; a Drum Rack's chains carry one. */
  inNotes?: number[];
  drum?: boolean;
  canHaveChains?: number;
}

/**
 * Register a rack on track 0 whose insert_chain really appends: each new chain
 * is registered at its own Live path, so a result can name where it landed.
 * @param options - What kind of rack, and the chains already on it
 * @returns The rack mock
 */
function registerRack({
  inNotes = [],
  drum = false,
  canHaveChains = 1,
}: RackOptions = {}): RegisteredMockObject {
  const chainIds: string[] = [];

  registerMockObject("track-0", { path: livePath.track(0), type: "Track" });

  /**
   * Register one chain at the next free index.
   * @param inNote - The chain's in_note, for a drum chain
   * @returns The chain's id
   */
  function addChain(inNote: number): string {
    const index = chainIds.length / 2;
    const id = String(200 + index);
    const chain = registerMockObject(id, {
      path: `${RACK_PATH} chains ${index}`,
      type: drum ? "DrumChain" : "Chain",
      properties: drum ? { in_note: inNote } : {},
    });

    // The default set() mock is a pure spy; a drum chain is moved onto its pad
    // by writing in_note, and the path it reports is read back off that.
    chain.set.mockImplementation((property: string, value: unknown) => {
      chain.properties[property] = value;
    });
    chainIds.push("id", id);

    return id;
  }

  for (const inNote of inNotes) {
    addChain(inNote);
  }

  return registerMockObject("100", {
    path: RACK_PATH,
    type: "RackDevice",
    properties: {
      chains: chainIds,
      can_have_chains: canHaveChains,
      can_have_drum_pads: drum ? 1 : 0,
    },
    // A Drum Rack appends on the catch-all pad; the caller moves it to a note.
    methods: { insert_chain: () => ["id", addChain(-1)] },
  });
}

describe('resolveInsertionPath, the "c+" that appends a chain', () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("appends to a rack and names the index the chain landed at", () => {
    const rack = registerRack({ inNotes: [0, 0] });

    const { container, position, containerPath } =
      resolveInsertionPath("t0/d0/c+");

    expect(rack.call).toHaveBeenCalledWith("insert_chain");
    expect(container?.path).toBe(`${RACK_PATH} chains 2`);
    expect(containerPath).toBe("t0/d0/c2");
    // A new chain is empty, so there is no slot inside it to aim at.
    expect(position).toBeNull();
  });

  // Appending to a Drum Rack puts the chain on the catch-all pad, which sounds
  // on every note no pad claims — not what "another chain" ever means.
  it("refuses a Drum Rack, pointing at the pad spelling", () => {
    const rack = registerRack({ drum: true });

    expect(() => resolveInsertionPath("t0/d0/c+")).toThrow(
      '"t0/d0/c+" appends a chain to a Drum Rack, where every chain belongs ' +
        'to a pad; name the pad instead (e.g. "t0/d0/pC1/c+")',
    );
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a device that has no chains at all", () => {
    registerRack({ canHaveChains: 0 });

    expect(() => resolveInsertionPath("t0/d0/c+")).toThrow(
      '"t0/d0/c+" appends a chain to a device that has none',
    );
  });

  it("adds a layer to a drum pad, on that pad's note", () => {
    const rack = registerRack({ drum: true, inNotes: [36] });

    const { container, containerPath } = resolveInsertionPath("t0/d0/pC1/c+");

    expect(rack.call).toHaveBeenCalledWith("insert_chain");
    expect(container?.getProperty("in_note")).toBe(36);
    expect(containerPath).toBe("t0/d0/pC1/c1");
  });

  it("appends to a rack nested under a drum pad", () => {
    registerRack({ drum: true, inNotes: [36] });

    const nested = registerNestedRack();

    const { container, containerPath } =
      resolveInsertionPath("t0/d0/pC1/d0/c+");

    expect(nested.call).toHaveBeenCalledWith("insert_chain");
    expect(container?.id).toBe("nested-chain");
    expect(containerPath).toBe("t0/d0/pC1/c0/d0/c0");
  });

  it("refuses when Live makes no chain on the nested rack", () => {
    registerRack({ drum: true, inNotes: [36] });
    registerNestedRack(() => 1);

    expect(() => resolveInsertionPath("t0/d0/pC1/d0/c+")).toThrow(
      'could not append a chain at "t0/d0/pC1/d0/c+"',
    );
  });

  it("makes a drum pad's first chain when it has none", () => {
    const rack = registerRack({ drum: true, inNotes: [] });

    const { containerPath } = resolveInsertionPath("t0/d0/pD1/c+");

    expect(rack.call).toHaveBeenCalledTimes(1);
    expect(containerPath).toBe("t0/d0/pD1/c0");
  });
});

/**
 * A rack inside the first drum chain's device slot, so a `c+` below a pad has
 * somewhere to land.
 * @param insertChain - What the rack answers to insert_chain
 * @returns The nested rack mock
 */
function registerNestedRack(
  insertChain: () => unknown = () => ["id", "nested-chain"],
): RegisteredMockObject {
  registerMockObject("nested-chain", {
    path: `${RACK_PATH} chains 0 devices 0 chains 0`,
    type: "Chain",
  });

  // Put the rack in the pad's first chain, in place, so the chain the drum
  // fixture already registered keeps its in_note.
  const drumChain = lookupMockObject(undefined, `${RACK_PATH} chains 0`);

  if (drumChain != null) {
    drumChain.properties.devices = children("nested-rack");
  }

  return registerMockObject("nested-rack", {
    path: `${RACK_PATH} chains 0 devices 0`,
    type: "RackDevice",
    properties: { can_have_chains: 1, can_have_drum_pads: 0, chains: [] },
    methods: { insert_chain: insertChain },
  });
}

describe('insertionContainerPath, the "c+" that appends a chain', () => {
  // There is no index to report until the chain exists, and nothing sits
  // inside a "c+" to trim off it.
  it("hands the path back as written", () => {
    expect(insertionContainerPath("t0/d0/c+")).toBe("t0/d0/c+");
    expect(insertionContainerPath("t0/d0/pC1/c+")).toBe("t0/d0/pC1/c+");
  });
});
