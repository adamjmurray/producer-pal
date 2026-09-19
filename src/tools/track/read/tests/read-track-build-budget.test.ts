// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Build budgets for readTrack: the drum-mode device walk, and the session
// clips it reads slot by slot.
//
// Budget test for the drum-mode device walk. Detecting whether a track is a
// drum rack means recursing its whole device tree, and a full track read wants
// the answer three times — session clips, arrangement clips, take lanes. It
// used to walk three times for one answer.
//
// The expensive shape is a rack with NO drum rack in it: a real drum rack ends
// the walk at the first device reporting can_have_drum_pads, so the case that
// costs the most is the one that finds nothing.
//
// These count resolutions rather than asserting output, so they fail when the
// walk comes back — a correctness test cannot see repeated work.

import { describe, expect, it } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { resolves } from "#src/live-api-adapter/tests/objects/build-budget-resolves.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.ts";
import { setupTrackMock } from "./helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "../read-track.ts";

/** How many chains the throwaway rack carries. */
const CHAIN_COUNT = 8;

/** Devices on each chain: one instrument, then two audio effects. */
const DEVICES_PER_CHAIN = 3;

/**
 * What the `instrument` field costs: every read pays it, whatever it asks for.
 * Added to the budgets below rather than folded in, so a growing walk is visible.
 */
const INSTRUMENT_WALK_CHAINS = CHAIN_COUNT;
const INSTRUMENT_WALK_OBJECTS = CHAIN_COUNT * 2;

/**
 * A track whose only device is an instrument rack with `CHAIN_COUNT` chains and
 * no drum rack anywhere — so a drum-mode walk recurses all of it and finds
 * nothing. Every chain carries an instrument and two audio effects behind it:
 * the effects are what a walk that reads a chain's whole device list builds and
 * throws away.
 */
function setupRackWithoutDrumRack(): void {
  const chainIds = Array.from(
    { length: CHAIN_COUNT },
    (_, i) => `rackChain${String(i)}`,
  );

  setupTrackMock({
    trackId: "track1",
    properties: mockTrackProperties({ devices: children("instrumentRack") }),
  });
  registerMockObject("instrumentRack", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: {
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      can_have_chains: 1,
      can_have_drum_pads: 0,
      class_name: "InstrumentGroupDevice",
      chains: children(...chainIds),
      return_chains: [],
    },
  });

  for (const [i, chainId] of chainIds.entries()) {
    registerMockObject(chainId, {
      path: livePath.track(0).device(0).chain(i),
      type: "Chain",
      properties: {
        name: `Chain ${String(i)}`,
        devices: children(
          `rackInstrument${String(i)}`,
          `rackEffect${String(i)}a`,
          `rackEffect${String(i)}b`,
        ),
      },
    });
    registerChainDevices(i);
  }
}

/**
 * Register one chain's instrument and the two audio effects behind it.
 * @param chainIndex - Which chain they sit on
 */
function registerChainDevices(chainIndex: number): void {
  const chainPath = livePath.track(0).device(0).chain(chainIndex);

  registerMockObject(`rackInstrument${String(chainIndex)}`, {
    path: chainPath.device(0),
    type: "Device",
    properties: {
      type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      class_display_name: "Operator",
    },
  });

  for (const [effectIndex, suffix] of ["a", "b"].entries()) {
    registerMockObject(`rackEffect${String(chainIndex)}${suffix}`, {
      path: chainPath.device(effectIndex + 1),
      type: "Device",
      properties: {
        type: LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        can_have_chains: 0,
        can_have_drum_pads: 0,
        class_display_name: "Reverb",
      },
    });
  }
}

/**
 * How many times a read built one of the rack's chains. The walk reaches them
 * by id, so this shape counts walks and nothing else.
 * @returns Resolutions of the rack's chain ids
 */
function chainResolves(): number {
  return resolves("id rackChain*");
}

/**
 * How many times a read built an audio effect sitting behind a chain's
 * instrument. Nothing needs them, so anything above zero is a walk reading a
 * chain's whole device list to find the one device it wanted.
 * @returns Resolutions of the rack's audio effect ids
 */
function effectResolves(): number {
  return resolves("id rackEffect*");
}

/** Clip slots on the fixture track. */
const SLOT_COUNT = 8;

/** A track of SLOT_COUNT slots with a clip in every other one. */
function setupTrackWithSessionClips(): void {
  const slotIds = Array.from(
    { length: SLOT_COUNT },
    (_, i) => `slot${String(i)}`,
  );

  setupTrackMock({
    trackId: "track1",
    properties: mockTrackProperties({ clip_slots: children(...slotIds) }),
  });

  for (let sceneIndex = 0; sceneIndex < SLOT_COUNT; sceneIndex += 2) {
    registerMockObject(`clip${String(sceneIndex)}`, {
      path: livePath.track(0).clipSlot(sceneIndex).clip(),
      type: "Clip",
      properties: { name: `Clip ${String(sceneIndex)}`, is_midi_clip: 1 },
    });
  }
}

describe("readTrack build budget", () => {
  it("walks the device tree once for drum mode, not once per clip collection", () => {
    setupRackWithoutDrumRack();

    // Session clips and arrangement clips both need drum mode; each used to
    // work it out for itself.
    readTrack({
      trackIndex: 0,
      include: ["session-clips", "arrangement-clips", "notes"],
    });

    // One walk visits each chain once. Any multiple of CHAIN_COUNT above one
    // means a caller went back to computing drum mode for itself.
    expect(chainResolves()).toBe(CHAIN_COUNT + INSTRUMENT_WALK_CHAINS);
  });

  it("skips the drum-mode walk when no clip read wants notes", () => {
    setupRackWithoutDrumRack();

    // Drum mode only changes how notes are formatted, so a read that asks for
    // no notes must not pay for the walk at all. What's left is the instrument
    // walk: each chain, and the first device on it.
    readTrack({ trackIndex: 0, include: ["session-clips"] });

    expect(chainResolves()).toBe(CHAIN_COUNT);
    expect(liveApiBuildStats().resolved).toBe(INSTRUMENT_WALK_OBJECTS + 3);

    // The instrument is the first device on every chain, so the two effects
    // behind it are never built.
    expect(effectResolves()).toBe(0);
  });

  it("walks the chains once per question asked, and no more", () => {
    setupRackWithoutDrumRack();

    readTrack({ trackIndex: 0, include: ["*"] });

    // Two questions, two walks: is there a kit in here (drum mode), and what
    // are its pads (drum-map). Neither can answer from the other, so two is
    // the floor — pinned so a third walk shows up as a number that moved.
    expect(chainResolves()).toBe(CHAIN_COUNT * 2 + INSTRUMENT_WALK_CHAINS);
  });

  it("builds one object per clip slot, not three", () => {
    setupTrackWithSessionClips();

    readTrack({ trackIndex: 0, include: ["session-clips"] });

    // Reading a slot used to check that its track and its scene were there
    // before going for the clip — so a track read rebuilt its own track object
    // once per scene, and built a scene object it never looked at again. A
    // clip that answers already proves both.
    expect(liveApiBuildStats().resolved).toBe(SLOT_COUNT + 2);
    expect(resolves("live_set tracks *")).toBe(1);
    expect(resolves("live_set scenes *")).toBe(0);
  });

  it("builds nothing but the chains to find out there is no drum map", () => {
    setupRackWithoutDrumRack();

    readTrack({ trackIndex: 0, include: ["drum-map"] });

    // The walk reads every chain and every device on it looking for a kit,
    // finds none, and returns no drum map at all — so all of it is spent on
    // output that never appears.
    expect(liveApiBuildStats().resolved).toBe(
      CHAIN_COUNT * (1 + DEVICES_PER_CHAIN) + INSTRUMENT_WALK_OBJECTS + 3,
    );
  });
});
