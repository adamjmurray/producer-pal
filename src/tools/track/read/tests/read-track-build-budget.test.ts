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
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { mockTrackProperties } from "./helpers/read-track-test-helpers.ts";
import { setupTrackMock } from "./helpers/read-track-registry-test-helpers.ts";
import { readTrack } from "../read-track.ts";

/** How many chains the throwaway rack carries. */
const CHAIN_COUNT = 8;

/**
 * A track whose only device is an instrument rack with `CHAIN_COUNT` chains and
 * no drum rack anywhere — so a drum-mode walk recurses all of it and finds
 * nothing.
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
      properties: { name: `Chain ${String(i)}`, devices: children() },
    });
  }
}

/**
 * How many times a read built one of the rack's chains. The walk reaches them
 * by id, so this shape counts walks and nothing else.
 * @returns Resolutions of the rack's chain ids
 */
function chainResolves(): number {
  return shapeResolves("id rackChain*");
}

/**
 * How many objects a read resolved of one target shape.
 * @param shape - Target shape, with indices written as `*`
 * @returns Resolutions of that shape
 */
function shapeResolves(shape: string): number {
  return (
    liveApiBuildStats().byShape.find(([found]) => found === shape)?.[1] ?? 0
  );
}

/** Session slots on the fixture track. */
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
    expect(chainResolves()).toBe(CHAIN_COUNT);
  });

  it("skips the walk entirely when no clip read wants notes", () => {
    setupRackWithoutDrumRack();

    // Drum mode only changes how notes are formatted, so a read that asks for
    // no notes must not pay for the walk at all.
    readTrack({ trackIndex: 0, include: ["session-clips"] });

    expect(chainResolves()).toBe(0);
  });

  it("walks the chains once per question asked, and no more", () => {
    setupRackWithoutDrumRack();

    readTrack({ trackIndex: 0, include: ["*"] });

    // Two questions, two walks: is there a kit in here (drum mode), and what
    // are its pads (drum-map). Neither can answer from the other, so two is
    // the floor — pinned so a third walk shows up as a number that moved.
    expect(chainResolves()).toBe(CHAIN_COUNT * 2);
  });

  it("builds one object per session slot, not three", () => {
    setupTrackWithSessionClips();

    readTrack({ trackIndex: 0, include: ["session-clips"] });

    // Reading a slot used to check that its track and its scene were there
    // before going for the clip — so a track read rebuilt its own track object
    // once per scene, and built a scene object it never looked at again. A
    // clip that answers already proves both.
    expect(liveApiBuildStats().resolved).toBe(SLOT_COUNT + 2);
    expect(shapeResolves("live_set tracks *")).toBe(1);
    expect(shapeResolves("live_set scenes *")).toBe(0);
  });

  it("builds nothing but the chains to find out there is no drum map", () => {
    setupRackWithoutDrumRack();

    readTrack({ trackIndex: 0, include: ["drum-map"] });

    // The walk reads every chain looking for a kit, finds none, and returns no
    // drum map at all — so anything it builds beyond the chains themselves is
    // spent on output that never appears. The chain mixer was the whole cost.
    expect(liveApiBuildStats().resolved).toBe(CHAIN_COUNT + 3);
  });
});
