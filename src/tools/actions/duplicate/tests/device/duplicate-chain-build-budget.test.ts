// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget test for copying a rack chain, which carries the source chain's
// devices into the copy one at a time.
//
// Everything the loop needs is settled before it starts: the destination chain
// is the same container for every device, and the temp track it takes them from
// does not move. A count that scales with the device count means the walk to
// one of them is being repeated per device.

import { describe, expect, it, vi } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

const DEVICES = 4;
const RACK = livePath.track(0).device(0);
const TEMP_CHAIN = `${livePath.track(1).device(0)} chains 0`;

/**
 * How many times the call resolved a target of this shape.
 * @param shape - Target shape, indices replaced with `*`
 * @returns Resolution count
 */
function resolves(shape: string): number {
  return liveApiBuildStats().byShape.find(([name]) => name === shape)?.[1] ?? 0;
}

/**
 * A rack on track 0 whose first chain holds DEVICES devices, plus the temp
 * track copy duplicate_track parks at track 1 for the carry.
 */
function setupRackWithDevices(): void {
  const deviceIds = Array.from(
    { length: DEVICES },
    (_, i) => `src-dev-${String(i)}`,
  );

  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { tracks: children("track-0") },
    methods: {
      duplicate_track: () => null,
      delete_track: () => null,
      move_device: () => null,
    },
  });
  registerMockObject("track-0", { path: livePath.track(0) });

  registerMockObject("rack-0", {
    path: RACK,
    type: "RackDevice",
    properties: {
      class_name: "InstrumentGroupDevice",
      has_macro_mappings: 0,
      return_chains: [],
      chains: children("chain-0", "chain-new"),
    },
    methods: { insert_chain: () => ["id", "chain-new"] },
  });

  registerMockObject("chain-0", {
    path: `${RACK} chains 0`,
    type: "Chain",
    properties: {
      name: "Source",
      mute: 0,
      solo: 0,
      devices: children(...deviceIds),
    },
  });

  // Where the copy lands. It reports the moved devices so every move reads back
  // as landed, which is what keeps the loop going for the whole count.
  registerMockObject("chain-new", {
    path: `${RACK} chains 1`,
    type: "Chain",
    properties: { name: "Source", devices: children("temp-dev") },
  });

  // The temp track's copy of the chain. Each pass takes its first device.
  registerMockObject("temp-chain", {
    path: TEMP_CHAIN,
    type: "Chain",
    properties: { devices: children("temp-dev") },
  });
  registerMockObject("temp-dev", {
    path: `${TEMP_CHAIN} devices 0`,
    type: "Device",
  });
}

describe("duplicate chain build budget", () => {
  // Pins today's cost: 12 resolutions per device carried, exactly 12N + 10, of
  // only 17 distinct targets however large N gets. Just one has to scale —
  // taking the temp track's first device, because moving one out shifts the
  // next into its place. The rest name things the carry settles before it
  // starts, and get walked again per device.
  //
  // DON'T HOIST THEM FOR SPEED. It was measured, not assumed: sharing the walk
  // across the carry cuts a quarter of the resolutions (778 -> 589 at N=64) and
  // buys 3% of wall time. Copying a chain costs about 205 ms a device on
  // 12.4.3 — 3.5 s at 16, 13.3 s at 64 — and that is duplicate_track copying
  // the whole host track plus one move_device per device. Resolving objects is
  // not what makes this slow, so removing every redundant walk would still land
  // near 15%. The target, if this ever has to be fast, is the temp-track
  // workaround itself.
  //
  // What the numbers are for: catching a NEW repeat. A count that climbs means
  // something started resolving per device that used to resolve once.
  it("costs what the per-device walk costs today", async () => {
    setupRackWithDevices();

    await duplicate({ type: "chain", id: "chain-0" });

    // Inherent: one source device per pass.
    expect(resolves("live_set tracks * devices * chains * devices *")).toBe(
      DEVICES,
    );

    // Invariant across the carry, resolved per device anyway.
    expect(resolves("live_set tracks * devices * chains *")).toBe(DEVICES * 2);
    expect(resolves("live_set tracks * devices * chains * mixer_device")).toBe(
      DEVICES * 2 + 2,
    );
    expect(resolves("live_set tracks *")).toBe(DEVICES);
    expect(resolves("live_set tracks * devices *")).toBe(DEVICES + 1);
  });
});
