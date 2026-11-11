// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A chain copy always appends, so `c+` and the bare rack path name the same
// destination — `c+` is just the spelling that says so.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  registerFixedChainRack,
  registerLive12Rack,
} from "#src/tools/device/tests/helpers/fixed-chain-rack-fixtures.ts";

vi.mock(import("#src/tools/device/update/helpers/move-device.ts"), () => ({
  moveDeviceToPath: vi.fn((): DeviceMove => ({ outcome: "moved" })),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxError: vi.fn(),
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
  emitWarningOnce: vi.fn(),
}));

import { type DeviceMove } from "#src/tools/device/update/helpers/move-device.ts";

const RACK = livePath.track(0).device(0);

/**
 * Register a rack holding one chain, plus the chain insert_chain will produce.
 * @param drum - Whether the rack is a Drum Rack
 */
function setupRack(drum = false): void {
  registerMockObject("live_set", { path: livePath.liveSet });
  registerMockObject("rack-0", {
    path: RACK,
    type: "RackDevice",
    properties: {
      class_name: drum ? "DrumGroupDevice" : "InstrumentGroupDevice",
      has_macro_mappings: 0,
      return_chains: [],
      chains: children("chain-0"),
      can_have_drum_pads: drum ? 1 : 0,
    },
    methods: { insert_chain: () => ["id", "chain-new"] },
  });
  registerMockObject("chain-0", {
    path: `${RACK} chains 0`,
    type: drum ? "DrumChain" : "Chain",
    properties: {
      name: "Source",
      mute: 0,
      solo: 0,
      devices: children(),
      ...(drum ? { in_note: 36 } : {}),
    },
  });
  registerMockObject("chain-new", {
    path: `${RACK} chains 1`,
    type: drum ? "DrumChain" : "Chain",
    properties: {
      name: "",
      mute: 0,
      solo: 0,
      devices: [],
      ...(drum ? { in_note: -1 } : {}),
    },
  });
}

describe("duplicate type=chain — c+ as a destination", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("appends the copy to the rack the c+ hangs off", async () => {
    setupRack();

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t0/d0/c+" }),
    ).resolves.toStrictEqual({ id: "chain-new", path: "t0/d0/c1" });
  });

  // A copy brings its source's in_note along, so a Drum Rack destination lands
  // on a pad rather than the catch-all — which is why `c+` is allowed here and
  // refused for a brand-new, note-less chain.
  it("takes a Drum Rack, where the copy carries its source's pad", async () => {
    setupRack(true);

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t0/d0/c+" }),
    ).resolves.toMatchObject({ id: "chain-new" });
  });

  // A drum pad holds chains, but a chain copy into one is a pad copy — that is
  // ppal-duplicate type="drum-pad", with a pad toPath.
  it("refuses a c+ on a drum pad, which names no rack", async () => {
    setupRack(true);

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t0/d0/pC1/c+" }),
    ).rejects.toThrow("no destination rack at toPath");
  });
});

// A Live 13 rack with fixed chains turns every insert_chain down, so a copy into
// one is refused before anything is made. Live 12 reads the limit as a bare 1
// and still copies.
const MULTIBAND =
  "Multiband Rack (id rack) has a fixed 3 chains (Low, Mid, High), so it can't take another";

describe("duplicate type=chain — a rack with fixed chains", () => {
  beforeEach(() => {
    clearMockRegistry();
    registerMockObject("live_set", { path: livePath.liveSet });
  });

  it("refuses a copy into the chain's own rack", async () => {
    const rack = registerFixedChainRack(0, "multiband");

    await expect(duplicate({ type: "chain", id: "chain-1" })).rejects.toThrow(
      MULTIBAND,
    );
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a copy to a c+ destination", async () => {
    registerFixedChainRack(0, "multiband");

    await expect(
      duplicate({ type: "chain", id: "chain-0", toPath: "t0/d0/c+" }),
    ).rejects.toThrow(MULTIBAND);
  });

  it("answers each chain of a list with the refusal", async () => {
    registerFixedChainRack(0, "multiband");

    await expect(
      duplicate({ type: "chain", id: "chain-0, chain-1" }),
    ).resolves.toStrictEqual([
      { id: "chain-0", ok: false, detail: MULTIBAND },
      { id: "chain-1", ok: false, detail: MULTIBAND },
    ]);
  });

  it("still copies on Live 12, where the property reads 1", async () => {
    const rack = registerLive12Rack(0, 1);

    await expect(
      duplicate({ type: "chain", id: "chain-0" }),
    ).resolves.toMatchObject({ id: "chain-1" });
    expect(rack.call).toHaveBeenCalledWith("insert_chain");
  });
});
