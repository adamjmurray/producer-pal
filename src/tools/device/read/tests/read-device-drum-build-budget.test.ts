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

/** Pads the fixture kit fills, each holding one chain with one instrument. */
const PADS = 16;
/** Return chains on the rack, so every chain mixer carries that many sends. */
const RETURNS = 6;
/** Pads on any Drum Rack, filled or not: Live gives it one per MIDI note. */
const RACK_PADS = 128;
/** MIDI note the kit's first pad sits on. */
const FIRST_NOTE = 36;

const RACK = livePath.track(1).device(0);

/**
 * Register a kit of PADS single-instrument pads on a rack with RETURNS returns.
 *
 * The rack carries all 128 pads, in note order, because Live's does — a fixture
 * listing only the filled ones puts them at the wrong notes and hides what a
 * read pays for the rest.
 */
function setupKit(sendsActive = false): void {
  const padIds = Array.from(
    { length: RACK_PADS },
    (_, note) => `pad${String(note)}`,
  );
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

  for (const [note, padId] of padIds.entries()) {
    registerFixturePad(note, padId);
  }

  for (let i = 0; i < PADS; i++) {
    setupPadChain(i, chainIds[i] as string, returnIds, sendsActive);
  }
}

/**
 * Register one of the rack's 128 DrumPads. Only the kit's notes carry a chain.
 * @param note - The MIDI note this pad answers to, and its index in the list
 * @param padId - Id for the DrumPad
 */
function registerFixturePad(note: number, padId: string): void {
  const filled = note >= FIRST_NOTE && note < FIRST_NOTE + PADS;

  registerMockObject(padId, {
    path: `${RACK} drum_pads ${String(note)}`,
    type: "DrumPad",
    properties: {
      note,
      name: filled ? `Pad ${String(note - FIRST_NOTE)}` : "",
      chains: filled ? children(`chain${String(note - FIRST_NOTE)}`) : [],
    },
  });
}

/**
 * Register one pad's chain: the chain, its instrument, and the chain mixer with
 * a send per return chain.
 * @param index - Chain index within the rack
 * @param chainId - Id for the chain
 * @param returnIds - The rack's return chain ids, one send each
 * @param sendsActive - Whether the sends are turned up
 */
function setupPadChain(
  index: number,
  chainId: string,
  returnIds: string[],
  sendsActive: boolean,
): void {
  const note = FIRST_NOTE + index;
  const chainPath = `${RACK} chains ${String(index)}`;

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
      properties: {
        display_value: sendsActive ? -12 : -70,
        value: sendsActive ? 0.5 : 0,
      },
    });
  }
}

describe("readDevice drum rack build budget", () => {
  it("reads a pad list without building 128 pads or a chain mixer", () => {
    setupKit();

    readDevice({ path: "t1/d0", include: ["drum-pads"], maxDepth: 0 });

    // The rack, one pad to check the list really is in note order, then per
    // filled pad: its chain for the name and state, and its device to answer
    // whether the pad makes a sound. Pad ids come off the rack's own list, so
    // the 112 empty pads cost nothing.
    expect(liveApiBuildStats().resolved).toBe(2 + PADS * 2);
  });

  it("reads a drum map without looking at the pads at all", () => {
    setupKit();

    readDevice({ path: "t1/d0", include: ["drum-map"], maxDepth: 0 });

    // Same, less the order check: a map is keyed by note, so no pad id is
    // shown and the pad list is never read.
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
    expect(liveApiBuildStats().resolved).toBe(2 + PADS * (2 + 3 + RETURNS));
  });

  it("names a chain's returns once per rack, not once per chain", () => {
    setupKit(true);

    readDevice({
      path: "t1/d0",
      include: ["drum-pads", "chains"],
      maxDepth: 0,
    });

    // A chain with a send up has to name the returns it feeds, and the names
    // live on the rack — the same rack for every chain. Reading them per chain
    // cost 1 + RETURNS objects a pad and doubled the time to read a 64-pad kit
    // against real Live. The + 1 + RETURNS here is the whole rack's share.
    expect(liveApiBuildStats().resolved).toBe(
      2 + PADS * (2 + 3 + RETURNS) + 1 + RETURNS,
    );
  });
});
