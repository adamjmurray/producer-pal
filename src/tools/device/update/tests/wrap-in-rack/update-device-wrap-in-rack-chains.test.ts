// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import {
  registerAudioEffectDevice,
  registerGrowingChainRack,
  registerRackChains,
  registerTrack0,
} from "./update-device-wrap-in-rack-test-helpers.ts";

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
    registerAudioEffectDevice("device-0", 0);
    registerAudioEffectDevice("device-1", 1);

    registerTrack0();

    // Rack starts with ONE chain and grows by one per insert_chain.
    newRack = registerGrowingChainRack(1);

    // Chains resolvable by "${rack.path} chains ${i}".
    registerRackChains(2);

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
