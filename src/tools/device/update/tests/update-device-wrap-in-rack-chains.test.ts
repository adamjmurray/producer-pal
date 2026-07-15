// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  livePath,
  registerMockObject,
  updateDevice,
} from "./update-device-test-helpers.ts";

// Chain-creation is only exercised when the rack starts with FEWER chains than
// devices being wrapped. The default wrap tests pre-populate the rack with
// enough chains, so the insert-chain loop never runs. These tests use a rack
// that grows its chain count as insert_chain is called, so the loop's bounds
// and arithmetic become observable.
describe("updateDevice - wrapInRack chain creation", () => {
  let newRack: RegisteredMockObject;
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    // Two audio effects to wrap.
    registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: { type: 2 },
    });
    registerMockObject("device-1", {
      path: livePath.track(0).device(1),
      type: "RackDevice",
      properties: { type: 2 },
    });

    registerMockObject("track-0", {
      path: livePath.track(0),
      methods: { insert_device: () => ["id", "new-rack"] },
    });

    // Rack starts with ONE chain and grows by one per insert_chain.
    let chainCount = 1;

    newRack = registerMockObject("new-rack", {
      path: "new-rack",
      type: "RackDevice",
      properties: { chains: [] },
    });
    newRack.get.mockImplementation((prop: string) => {
      if (prop === "chains") {
        const chains: string[] = [];

        for (let i = 0; i < chainCount; i++) chains.push("id", `chain-${i}`);

        return chains;
      }

      return [0];
    });
    newRack.call.mockImplementation((method: string) => {
      if (method === "insert_chain") {
        chainCount++;

        return ["id", `chain-${chainCount - 1}`];
      }

      return null;
    });

    // Chains resolvable by "${rack.path} chains ${i}".
    registerMockObject("chain-0", { type: "Chain", path: "new-rack chains 0" });
    registerMockObject("chain-1", { type: "Chain", path: "new-rack chains 1" });

    liveSet = registerMockObject("live-set", { path: "live_set" });
  });

  it("inserts exactly one chain per device beyond the rack's existing chains", () => {
    // Rack has 1 chain; wrapping 2 devices needs exactly 1 more (not 0, not 2).
    const result = updateDevice({ path: "t0/d0,t0/d1", wrapInRack: true });

    const insertChainCalls = newRack.call.mock.calls.filter(
      (c: unknown[]) => c[0] === "insert_chain",
    );

    expect(insertChainCalls).toHaveLength(1);

    // Device 0 reuses the pre-existing chain 0; device 1 lands in the new chain 1.
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id chain-0",
      0,
    );
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-1",
      "id chain-1",
      0,
    );

    // A successful insert must not report a chain-creation failure.
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("failed to create chain"),
    );

    expect(result).toStrictEqual({
      id: "new-rack",
      type: "audio-effect-rack",
      deviceCount: 2,
    });
  });
});
