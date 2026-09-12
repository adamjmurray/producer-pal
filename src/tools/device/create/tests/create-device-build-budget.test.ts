// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget test for a batch device build.
//
// Building a kit or a multi-chain rack in one call is the recommended usage,
// and every path in that batch climbs the same prefix. Each path used to
// re-resolve the track and the rack, and each created device was built twice.
//
// These count resolutions rather than asserting output: the results were always
// right, only the price was wrong.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({ warn: vi.fn() }));

const CHAINS = 8;

/** A track holding one rack of CHAINS empty chains. */
function setupRack(): void {
  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { devices: children("rack") },
    methods: { insert_device: () => ["id", "newdev"] },
  });
  registerMockObject("rack", {
    path: livePath.track(0).device(0),
    properties: {
      chains: children(
        ...Array.from({ length: CHAINS }, (_, i) => `chain${String(i)}`),
      ),
      can_have_chains: 1,
      can_have_drum_pads: 0,
    },
  });

  for (let i = 0; i < CHAINS; i++) {
    registerMockObject(`chain${String(i)}`, {
      path: livePath.track(0).device(0).chain(i),
      properties: { devices: children() },
      methods: { insert_device: () => ["id", "newdev"] },
    });
  }

  registerMockObject("newdev", {
    path: livePath.track(0).device(0).chain(0).device(0),
  });
}

/**
 * How many times the call resolved a target of this shape.
 * @param shape - Target shape, indices replaced with `*`
 * @returns Resolution count
 */
function resolves(shape: string): number {
  return liveApiBuildStats().byShape.find(([name]) => name === shape)?.[1] ?? 0;
}

const PAD_NOTES = ["C1", "D1", "E1", "F1"];
const FIRST_NOTE = 36;

/**
 * A track holding a Drum Rack whose pads already carry a chain each. Live gives
 * a rack all 128 pads whatever the kit holds, so the fixture does too.
 */
function setupKit(): void {
  const padIds = Array.from({ length: 128 }, (_, note) => `pad${String(note)}`);
  const chainIds = PAD_NOTES.map((_, i) => `kitchain${String(i)}`);

  registerMockObject("track-1", {
    path: livePath.track(1),
    properties: { devices: children("kit") },
  });
  registerMockObject("kit", {
    path: livePath.track(1).device(0),
    properties: {
      can_have_chains: 1,
      can_have_drum_pads: 1,
      drum_pads: children(...padIds),
      chains: children(...chainIds),
    },
  });

  for (const [note, padId] of padIds.entries()) {
    registerMockObject(padId, {
      path: `${livePath.track(1).device(0).toString()} drum_pads ${String(note)}`,
      properties: { note },
    });
  }

  for (const [i, chainId] of chainIds.entries()) {
    registerMockObject(chainId, {
      path: livePath.track(1).device(0).chain(i),
      properties: { in_note: FIRST_NOTE + i * 2, devices: children() },
      methods: { insert_device: () => ["id", "newdev"] },
    });
  }
}

describe("createDevice build budget", () => {
  beforeEach(setupRack);

  it("resolves the shared prefix once for the whole batch", () => {
    const paths = Array.from(
      { length: CHAINS },
      (_, i) => `t0/d0/c${String(i)}`,
    );

    createDevice({ deviceName: "Operator", path: paths.join(",") });

    // The track and the rack are the same objects for every path. CHAINS times
    // this many means each path re-walked the prefix.
    expect(resolves("live_set tracks *")).toBe(1);
    expect(resolves("live_set tracks * devices *")).toBe(1);

    // One chain each, and one object per created device rather than two.
    expect(resolves("live_set tracks * devices * chains *")).toBe(CHAINS);
    expect(resolves("id newdev")).toBe(CHAINS);
  });

  it("builds one object for a single created device, not two", () => {
    createDevice({ deviceName: "Operator", path: "t0/d0/c0" });

    expect(resolves("id newdev")).toBe(1);
  });

  // Building a kit in one call is the recommended usage, and every pad path
  // used to resolve the rack twice over.
  it("resolves the rack once for a whole kit of pad paths", () => {
    setupKit();

    createDevice({
      deviceName: "Reverb",
      path: PAD_NOTES.map((note) => `t1/d0/p${note}`).join(","),
    });

    expect(resolves("live_set tracks * devices *")).toBe(1);
  });
});
