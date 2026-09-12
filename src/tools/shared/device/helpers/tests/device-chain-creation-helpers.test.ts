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
import { requireDeviceContainer } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
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

/**
 * Resolves a path the way the device tools do, so these tests exercise the real
 * parse rather than hand-built segments.
 * @param path - Device path (e.g. "t0/d0/c4")
 * @returns The resolved container
 */
function resolveContainer(path: string): LiveAPI {
  const { root, segments } = requireDeviceContainer(parseObjectPath(path));

  return resolveContainerWithAutoCreate(
    root,
    segments.filter((segment) => segment.kind !== "drum-pad"),
    path,
  );
}

describe("resolveContainerWithAutoCreate", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("creates only the chains that are missing when some already exist", () => {
    // 2 chains exist and c4 is requested → exactly 3 new chains (indices 2-4).
    // The count is targetIndex + 1 - existing, read from the live chain list.
    const rack = registerGrowingRack(2);

    resolveContainer("t0/d0/c4");

    expect(rack.call).toHaveBeenCalledTimes(3);
  });

  it("auto-creates up to exactly the maximum without throwing", () => {
    // c15 on an empty rack needs 16 chains — exactly the cap, which must
    // succeed (the guard is `> MAX`, not `>= MAX`).
    const rack = registerGrowingRack(0);

    expect(() => resolveContainer("t0/d0/c15")).not.toThrow();
    expect(rack.call).toHaveBeenCalledTimes(16);
  });

  it("throws when insert_chain returns an array without an id tag", () => {
    // Live signals success with ["id", <id>]; any other array shape is a
    // failure and must abort rather than be treated as a created chain.
    registerGrowingRack(0, () => ["error", "5"]);

    expect(() => resolveContainer("t0/d0/c0")).toThrow(
      "Failed to create chain 1/1",
    );
  });

  it("stops at the device when the path names no chain", () => {
    const rack = registerGrowingRack(0);

    expect(resolveContainer("t0/d0").path).toBe(DEVICE_PATH);
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

  /**
   * A Drum Rack in the outer rack's C1 pad, whose insert_chain grows its own
   * chain list with a D1 pad chain.
   * @param outerInNote - The outer chain's in_note (-1 for the catch-all pad)
   * @returns The inner rack mock, and the outer rack it sits in
   */
  function registerNestedDrumRack(outerInNote = 36): {
    inner: RegisteredMockObject;
    outer: RegisteredMockObject;
  } {
    const outer = registerDrumRack([["drum-chain-36", outerInNote]]);
    const innerChainIds: string[] = [];

    registerMockObject("drum-chain-36", {
      path: `${DEVICE_PATH} chains 0`,
      type: "DrumChain",
      properties: { in_note: outerInNote, devices: ["id", "inner-rack"] },
    });
    registerMockObject("inner-chain", {
      type: "DrumChain",
      properties: { in_note: 38 },
    });

    const inner = registerMockObject("inner-rack", {
      path: `${DEVICE_PATH} chains 0 devices 0`,
      type: "RackDevice",
      properties: { chains: innerChainIds, can_have_drum_pads: 1 },
      methods: {
        insert_chain: () => {
          innerChainIds.push("id", "inner-chain");

          return ["id", "inner-chain"];
        },
      },
    });

    return { inner, outer };
  }

  /**
   * Resolve a nested pad path against the nested drum rack, and check the inner
   * rack — not the outer one — created the chain.
   * @param pad - The outer rack's pad
   * @param segments - The path segments below that pad
   * @param outerInNote - The outer chain's in_note (-1 for the catch-all pad)
   */
  function expectInnerRackCreatesChain(
    pad: string,
    segments: string[],
    outerInNote?: number,
  ): void {
    const { inner, outer } = registerNestedDrumRack(outerInNote);

    const chain = resolveOrCreateDrumPadChain(
      LiveAPI.from(DEVICE_PATH),
      pad,
      segments,
    );

    expect(chain?.id).toBe("inner-chain");
    expect(inner.call).toHaveBeenCalledWith("insert_chain");
    expect(outer.call).not.toHaveBeenCalledWith("insert_chain");
  }

  it("creates the inner rack's pad chain, not the outer rack's", () => {
    // The count was read off the outer rack, whose C1 pad already had a chain,
    // so nothing was created and the path resolved to nothing at all.
    expectInnerRackCreatesChain("C1", ["c0", "d0", "pD1"]);
  });

  // No leading `c`: the walk starts at the device, and the outer pad's chain 0
  // is implied.
  it("creates the inner rack's pad chain without an explicit outer chain", () => {
    expectInnerRackCreatesChain("C1", ["d0", "pD1"]);
  });

  it("refuses a nested pad with nothing between it and the outer pad", () => {
    const { inner, outer } = registerNestedDrumRack();

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", ["pD1"]),
    ).toBeNull();
    expect(inner.call).not.toHaveBeenCalledWith("insert_chain");
    expect(outer.call).not.toHaveBeenCalledWith("insert_chain");
  });

  // A pad with no chains reports the miss as a chain miss whatever follows it,
  // so a device segment lands in the chain-index parser and has to be refused.
  it("refuses a device segment where a chain index belongs", () => {
    const rack = registerDrumRack([]);

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", ["d0"]),
    ).toBeNull();
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("resolves an inner pad chain that already exists", () => {
    const { inner } = registerNestedDrumRack();

    inner.call("insert_chain");
    inner.call.mockClear();

    const chain = resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
      "d0",
      "pD1",
    ]);

    expect(chain?.id).toBe("inner-chain");
    expect(inner.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a nested pad that names no device to nest under", () => {
    const { inner } = registerNestedDrumRack();

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
        "c0",
        "pD1",
      ]),
    ).toBeNull();
    expect(inner.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a nested pad segment with no note", () => {
    const { inner } = registerNestedDrumRack();

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
        "c0",
        "d0",
        "p",
      ]),
    ).toBeNull();
    expect(inner.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a missing device: only a missing chain is auto-creatable", () => {
    const rack = registerDrumRack([["drum-chain-36", 36]]);

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
        "c0",
        "d9",
      ]),
    ).toBeNull();
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses to create a pad chain the path continues past", () => {
    // The created chain is empty, so `d0/c0` can never resolve in it. Returning
    // it would insert the device into pC1/c1 instead of failing.
    const rack = registerDrumRack([["drum-chain-36", 36]]);

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
        "c1",
        "d0",
        "c0",
      ]),
    ).toBeNull();
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a chain miss inside a rack nested in the pad", () => {
    // The miss comes back from the nested walk, which carries no chain count.
    const { inner, outer } = registerNestedDrumRack();

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
        "c0",
        "d0",
        "c5",
      ]),
    ).toBeNull();
    expect(inner.call).not.toHaveBeenCalledWith("insert_chain");
    expect(outer.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a chain segment with an unparseable index", () => {
    const rack = registerDrumRack([["drum-chain-36", 36]]);

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", ["cx"]),
    ).toBeNull();
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a nested pad whose outer chain segment is unparseable", () => {
    const { inner, outer } = registerNestedDrumRack();

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
        "cx",
        "d0",
        "pD1",
      ]),
    ).toBeNull();
    expect(inner.call).not.toHaveBeenCalledWith("insert_chain");
    expect(outer.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a nested pad whose walk misses the device it nests under", () => {
    const { inner } = registerNestedDrumRack();

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
        "c0",
        "d9",
        "pD1",
      ]),
    ).toBeNull();
    expect(inner.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a nested pad whose walk lands on a chain, not a device", () => {
    const { inner } = registerNestedDrumRack();

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "C1", [
        "c0",
        "c0",
        "pD1",
      ]),
    ).toBeNull();
    expect(inner.call).not.toHaveBeenCalledWith("insert_chain");
  });
  it("refuses to create a chain for the catch-all pad", () => {
    // Live clamps in_note to 0-127, so insert_chain would strand an empty chain
    // on note 36 and then fail to find a catch-all chain to return.
    const rack = registerDrumRack([]);

    expect(
      resolveOrCreateDrumPadChain(LiveAPI.from(DEVICE_PATH), "*", []),
    ).toBeNull();
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("resolves a catch-all chain that already exists", () => {
    const rack = registerDrumRack([["catch-all-chain", -1]]);

    const chain = resolveOrCreateDrumPadChain(
      LiveAPI.from(DEVICE_PATH),
      "*",
      [],
    );

    expect(chain?.id).toBe("catch-all-chain");
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("creates a pad chain in a rack nested under an existing catch-all chain", () => {
    // Only creating the catch-all chain is impossible. Once one exists, a path
    // through it is an ordinary nested pad.
    expectInnerRackCreatesChain("*", ["c0", "d0", "pD1"], -1);
  });
});
