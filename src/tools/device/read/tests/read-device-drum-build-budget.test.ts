// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget test for the drum rack walk.
//
// Reading a kit's pad names used to cost around 20 LiveAPI objects per pad,
// nearly all of them thrown away: a pad shows its chains only when chains were
// asked for too, but the walk built the full chain info either way — and a
// chain's mixer is a mixer, a volume, a pan, and one send per return chain.
//
// These count resolutions rather than asserting output, because the output
// never changed. The waste was invisible from the response.

import { describe, expect, it } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "../read-device.ts";

/** Pads in the fixture kit, each holding one chain with one instrument. */
const PADS = 16;
/** Return chains on the rack, so every chain mixer carries that many sends. */
const RETURNS = 6;

const RACK = livePath.track(1).device(0);

/** Register a kit of PADS single-instrument pads on a rack with RETURNS returns. */
function setupKit(): void {
  const padIds = Array.from({ length: PADS }, (_, i) => `pad${String(i)}`);
  const chainIds = Array.from({ length: PADS }, (_, i) => `chain${String(i)}`);
  const returnIds = Array.from({ length: RETURNS }, (_, i) => `rc${String(i)}`);

  registerMockObject("kit", {
    path: RACK,
    type: "Device",
    properties: {
      name: "Kit",
      class_display_name: "Drum Rack",
      type: 1,
      can_have_chains: 1,
      can_have_drum_pads: 1,
      is_active: 1,
      drum_pads: children(...padIds),
      chains: children(...chainIds),
      return_chains: children(...returnIds),
    },
  });

  for (const [i, returnId] of returnIds.entries()) {
    registerMockObject(returnId, {
      path: `${RACK} return_chains ${String(i)}`,
      type: "Chain",
      properties: { name: `Return ${String(i)}` },
    });
  }

  for (let i = 0; i < PADS; i++) {
    setupPad(i, padIds[i] as string, chainIds[i] as string, returnIds);
  }
}

/**
 * Register one pad: the DrumPad, its chain, the chain's instrument, and the
 * chain mixer with a send per return chain.
 * @param index - Pad index, which is also its chain index
 * @param padId - Id for the DrumPad
 * @param chainId - Id for the pad's chain
 * @param returnIds - The rack's return chain ids, one send each
 */
function setupPad(
  index: number,
  padId: string,
  chainId: string,
  returnIds: string[],
): void {
  const note = 36 + index;
  const chainPath = `${RACK} chains ${String(index)}`;

  registerMockObject(padId, {
    path: `${RACK} drum_pads ${String(note)}`,
    type: "DrumPad",
    properties: {
      note,
      name: `Pad ${String(index)}`,
      chains: children(chainId),
    },
  });

  registerMockObject(chainId, {
    path: chainPath,
    type: "DrumChain",
    properties: {
      name: `Pad ${String(index)}`,
      in_note: note,
      out_note: 36,
      mute: 0,
      solo: 0,
      muted_via_solo: 0,
      choke_group: 0,
      devices: children(`dev${String(index)}`),
    },
  });

  registerMockObject(`dev${String(index)}`, {
    path: `${chainPath} devices 0`,
    type: "Device",
    properties: {
      name: "Simpler",
      class_display_name: "Simpler",
      type: 1,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
    },
  });

  const sendIds = returnIds.map((_, r) => `send${String(index)}_${String(r)}`);

  registerMockObject(`mixer${String(index)}`, {
    path: `${chainPath} mixer_device`,
    type: "MixerDevice",
    properties: {
      volume: children(`vol${String(index)}`),
      panning: children(`pan${String(index)}`),
      sends: children(...sendIds),
    },
  });
  registerMockObject(`vol${String(index)}`, {
    path: `${chainPath} mixer_device volume`,
    type: "DeviceParameter",
    properties: { display_value: 0, value: 0 },
  });
  registerMockObject(`pan${String(index)}`, {
    path: `${chainPath} mixer_device panning`,
    type: "DeviceParameter",
    properties: { display_value: 0, value: 0 },
  });

  for (const [r, sendId] of sendIds.entries()) {
    registerMockObject(sendId, {
      path: `${chainPath} mixer_device sends ${String(r)}`,
      type: "DeviceParameter",
      properties: { display_value: -70, value: 0 },
    });
  }
}

describe("readDevice drum rack build budget", () => {
  it("reads a pad list without touching the chain mixers", () => {
    setupKit();

    readDevice({ path: "t1/d0", include: ["drum-pads"], maxDepth: 0 });

    // The rack, then per pad: the DrumPad for its id, its chain for the name
    // and state, and its device to answer whether the pad makes a sound.
    expect(liveApiBuildStats().resolved).toBe(1 + PADS * 3);
  });

  it("reads a drum map without building the pads either", () => {
    setupKit();

    readDevice({ path: "t1/d0", include: ["drum-map"], maxDepth: 0 });

    // Same, less the DrumPads: a map is keyed by note, so no pad id is shown.
    expect(liveApiBuildStats().resolved).toBe(1 + PADS * 2);
  });

  it("still builds the chain mixers when the chains are shown", () => {
    setupKit();

    readDevice({
      path: "t1/d0",
      include: ["drum-pads", "chains"],
      maxDepth: 0,
    });

    // Pins which way round it is: the mixer read is skipped because nothing
    // shows it, not because it stopped happening. Per chain that mixer costs
    // the mixer device, a volume, a pan, and one send per return chain.
    expect(liveApiBuildStats().resolved).toBe(1 + PADS * (3 + 3 + RETURNS));
  });
});
