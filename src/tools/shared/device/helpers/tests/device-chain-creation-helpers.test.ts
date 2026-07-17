// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  resolveContainerWithAutoCreate,
  resolveOrCreateDrumPadChain,
} from "../device-chain-creation-helpers.ts";

const DEVICE_PATH = "live_set tracks 0 devices 0";

/**
 * Register a chain-capable (non-drum) rack on track 0 whose insert_chain grows
 * its own chain list, so auto-creation sees the list advance.
 * @param existingChainCount - Chains present before auto-creation
 * @param insertChain - Optional insert_chain override (defaults to a growing stub)
 * @returns The rack mock
 */
function registerGrowingRack(
  existingChainCount = 0,
  insertChain?: () => unknown,
): RegisteredMockObject {
  const chainIds: string[] = [];

  for (let i = 0; i < existingChainCount; i++) {
    chainIds.push("id", `chain-${String(i)}`);
  }

  registerMockObject("track-0", { path: livePath.track(0), type: "Track" });

  return registerMockObject("rack", {
    path: DEVICE_PATH,
    type: "RackDevice",
    properties: {
      chains: chainIds,
      can_have_chains: 1,
      can_have_drum_pads: 0,
    },
    methods: {
      insert_chain:
        insertChain ??
        (() => {
          const id = `chain-${String(chainIds.length / 2)}`;

          chainIds.push("id", id);

          return ["id", id];
        }),
    },
  });
}

describe("resolveContainerWithAutoCreate", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("creates only the chains that are missing when some already exist", () => {
    // 2 chains exist and c4 is requested → exactly 3 new chains (indices 2-4).
    // The count is targetIndex + 1 - existing, read from the live chain list.
    const rack = registerGrowingRack(2);

    resolveContainerWithAutoCreate(["t0", "d0", "c4"], "t0/d0/c4");

    expect(rack.call).toHaveBeenCalledTimes(3);
  });

  it("auto-creates up to exactly the maximum without throwing", () => {
    // c15 on an empty rack needs 16 chains — exactly the cap, which must
    // succeed (the guard is `> MAX`, not `>= MAX`).
    const rack = registerGrowingRack(0);

    expect(() =>
      resolveContainerWithAutoCreate(["t0", "d0", "c15"], "t0/d0/c15"),
    ).not.toThrow();
    expect(rack.call).toHaveBeenCalledTimes(16);
  });

  it("throws when insert_chain returns an array without an id tag", () => {
    // Live signals success with ["id", <id>]; any other array shape is a
    // failure and must abort rather than be treated as a created chain.
    registerGrowingRack(0, () => ["error", "5"]);

    expect(() =>
      resolveContainerWithAutoCreate(["t0", "d0", "c0"], "t0/d0/c0"),
    ).toThrow("Failed to create chain 1/1");
  });

  it("ignores a segment that is neither a device nor a chain", () => {
    // Only d / c / rc prefixes navigate; an unrecognized segment leaves the
    // container where it was rather than being coerced into a chain lookup.
    const rack = registerGrowingRack(0);

    const container = resolveContainerWithAutoCreate(
      ["t0", "d0", "zz"],
      "t0/d0/zz",
    );

    expect(container.path).toBe(DEVICE_PATH);
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });
});

describe("resolveOrCreateDrumPadChain", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  /**
   * Register a Drum Rack whose insert_chain is a no-op stub (chains never grow),
   * plus the given note-mapped chains.
   * @param chains - [id, in_note] pairs to register as the rack's chains
   * @returns The rack mock
   */
  function registerDrumRack(chains: [string, number][]): RegisteredMockObject {
    const chainIds = chains.flatMap(([id]) => ["id", id]);

    for (const [id, inNote] of chains) {
      registerMockObject(id, {
        type: "DrumChain",
        properties: { in_note: inNote },
      });
    }

    return registerMockObject("drum-rack", {
      path: DEVICE_PATH,
      type: "RackDevice",
      properties: { chains: chainIds, can_have_drum_pads: 1 },
      methods: { insert_chain: () => ["id", "new-chain"] },
    });
  }

  it("returns null without touching a rack that does not exist", () => {
    const rack = registerMockObject("0", { path: DEVICE_PATH });

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", []),
    ).toBeNull();
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("returns an existing pad chain without creating one", () => {
    const rack = registerDrumRack([["drum-chain-36", 36]]);

    const chain = resolveOrCreateDrumPadChain(
      LiveAPI.from(DEVICE_PATH),
      "C1",
      [],
    );

    expect(chain?.id).toBe("drum-chain-36");
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("resolves an explicitly addressed chain 0 within the pad", () => {
    registerDrumRack([["drum-chain-36", 36]]);

    const chain = resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
      "c0",
    ]);

    expect(chain?.id).toBe("drum-chain-36");
  });

  it("auto-creates the pad chain when c0 is addressed but missing", () => {
    // The pad has no chain yet, so "c0" must parse to index 0 and drive
    // creation — the reject boundary is `< 0`, not `<= 0`, which would discard
    // the (valid) index 0 and silently create nothing.
    const rack = registerDrumRack([["other-chain", 40]]);

    resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", ["c0"]);

    expect(rack.call).toHaveBeenCalledWith("insert_chain");
  });

  it("auto-creates up to exactly the maximum pad chains without throwing", () => {
    // c15 with no chains in the note group needs 16 — exactly the cap.
    const rack = registerDrumRack([]);

    expect(() =>
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", ["c15"]),
    ).not.toThrow();
    expect(rack.call).toHaveBeenCalledTimes(16);
  });
});
