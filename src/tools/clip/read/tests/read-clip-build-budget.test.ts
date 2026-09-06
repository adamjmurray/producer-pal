// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Build budgets for reading clips one at a time.
//
// read-track already budgets the clips it reaches through a track read. This
// file is about the other caller: a model reading clips by path or by id,
// where nothing above the clip is shared between one call and the next.
//
// The number that moves is the drum-mode walk. Formatting notes needs to know
// whether the track holds a drum rack, and working that out recurses the
// track's whole device tree. The answer is memoized per track for the request,
// so the walk is paid once however many of the track's clips a request reads.
// The expensive fixture is a rack with NO drum rack in it: a real drum rack
// ends the walk at the first device reporting can_have_drum_pads.
//
// These count resolutions rather than asserting output, so they fail when a
// repeat comes back — a correctness test cannot see repeated work.

import { beforeEach, describe, expect, it } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { inOneRequest } from "./read-clip-test-helpers.ts";

/** How many chains the throwaway rack carries. */
const CHAIN_COUNT = 8;

/** How many session clips the track holds. */
const CLIP_COUNT = 8;

/** What one drum-mode walk of the fixture costs: the track, the rack, its chains. */
const WALK_COST = CHAIN_COUNT + 2;

/** Scene index of the one clip in the fixture that holds no notes. */
const EMPTY_CLIP_SCENE = CLIP_COUNT;

/** One note, so notes are formatted for real rather than skipped as empty. */
const NOTES = [
  {
    note_id: 1,
    pitch: 60,
    start_time: 0,
    duration: 1,
    velocity: 100,
    probability: 1,
    velocity_deviation: 0,
  },
];

/**
 * How many objects the call resolved of one target shape.
 * @param shape - Target shape, indices written as `*`
 * @returns Resolutions of that shape
 */
function resolves(shape: string): number {
  return liveApiBuildStats().byShape.find(([name]) => name === shape)?.[1] ?? 0;
}

/**
 * A track whose only device is an instrument rack of CHAIN_COUNT chains with no
 * drum rack anywhere, holding CLIP_COUNT MIDI clips in its first session slots.
 */
function setupTrackWithClips(): void {
  const chainIds = Array.from(
    { length: CHAIN_COUNT },
    (_, i) => `rackChain${String(i)}`,
  );

  registerMockObject("track-0", {
    path: livePath.track(0),
    properties: { devices: children("instrumentRack") },
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

  for (let sceneIndex = 0; sceneIndex <= EMPTY_CLIP_SCENE; sceneIndex++) {
    const notes = sceneIndex === EMPTY_CLIP_SCENE ? [] : NOTES;

    registerMockObject(`clip${String(sceneIndex)}`, {
      path: livePath.track(0).clipSlot(sceneIndex).clip(),
      type: "Clip",
      properties: {
        name: `Clip ${String(sceneIndex)}`,
        is_midi_clip: 1,
        length: 4,
        signature_numerator: 4,
        signature_denominator: 4,
        start_marker: 0,
        end_marker: 4,
        loop_start: 0,
        loop_end: 4,
      },
      methods: { get_notes_extended: () => JSON.stringify({ notes }) },
    });
  }
}

describe("readClip build budget", () => {
  beforeEach(setupTrackWithClips);

  it("builds the clip and nothing above it", () => {
    readClip({ path: "t0/s0" });

    // A clip that answers proves its track and its scene are there, so a read
    // by path costs exactly the clip.
    expect(liveApiBuildStats().resolved).toBe(1);
    expect(resolves("live_set tracks *")).toBe(0);
    expect(resolves("live_set scenes *")).toBe(0);

    // Drum mode only changes how notes are spelled, so a read asking for no
    // notes must not pay for the device walk at all.
    expect(resolves("id rackChain*")).toBe(0);
  });

  it("walks the device tree once for every clip one request reads", () => {
    inOneRequest(() => {
      for (let sceneIndex = 0; sceneIndex < CLIP_COUNT; sceneIndex++) {
        readClip({ path: `t0/s${String(sceneIndex)}`, include: ["notes"] });
      }
    });

    // The memo is what makes this one walk instead of CLIP_COUNT of them, and
    // it is keyed on the track, so the walk is paid before the first clip and
    // never again. Every clip after that costs only itself.
    expect(resolves("id rackChain*")).toBe(CHAIN_COUNT);
    expect(liveApiBuildStats().resolved).toBe(WALK_COST + CLIP_COUNT);
  });

  it("walks again for the next request", () => {
    for (let sceneIndex = 0; sceneIndex < 2; sceneIndex++) {
      inOneRequest(() => {
        readClip({ path: `t0/s${String(sceneIndex)}`, include: ["notes"] });
      });
    }

    // Nothing derived may outlive the request that derived it — the user can
    // drop a drum rack on the track between two reads. So two requests pay two
    // walks, and this is the cost the batch readers still avoid with drumMode.
    expect(resolves("id rackChain*")).toBe(CHAIN_COUNT * 2);
    expect(liveApiBuildStats().resolved).toBe((WALK_COST + 1) * 2);
  });

  it("skips the walk for a clip with no notes to spell", () => {
    readClip({
      path: `t0/s${String(EMPTY_CLIP_SCENE)}`,
      include: ["notes"],
    });

    // Drum mode only decides how notes are spelled. An empty clip has none, so
    // the answer is never used and must not be worked out.
    expect(liveApiBuildStats().resolved).toBe(1);
    expect(resolves("id rackChain*")).toBe(0);
  });

  it("costs one object per clip when the caller supplies drum mode", () => {
    for (let sceneIndex = 0; sceneIndex < CLIP_COUNT; sceneIndex++) {
      readClip({
        path: `t0/s${String(sceneIndex)}`,
        include: ["notes"],
        drumMode: false,
      });
    }

    // The same reads as above with the answer handed over: the clip and
    // nothing else, per clip. Anything above one per clip means some other
    // shared fact started being worked out per clip.
    expect(liveApiBuildStats().resolved).toBe(CLIP_COUNT);
    expect(resolves("id rackChain*")).toBe(0);
    expect(resolves("live_set tracks *")).toBe(0);
  });

  it("builds the track and the scene only to explain an empty slot", () => {
    registerMockObject("scene9", { path: livePath.scene(9), properties: {} });
    mockNonExistentObjects();

    readClip({ path: "t0/s9" });

    // Nothing at the address: only now does telling an empty slot from a bad
    // one need the track and the scene, and it needs each of them once.
    expect(liveApiBuildStats().resolved).toBe(3);
    expect(resolves("live_set tracks *")).toBe(1);
    expect(resolves("live_set scenes *")).toBe(1);
  });
});

/** How many clips sit on the arrangement track. */
const ARRANGEMENT_CLIP_COUNT = 4;

/** A track carrying ARRANGEMENT_CLIP_COUNT arrangement clips, 4 bars apart. */
function setupArrangementTrack(): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  const clipIds = Array.from(
    { length: ARRANGEMENT_CLIP_COUNT },
    (_, i) => `arrClip${String(i)}`,
  );

  registerMockObject("track-1", {
    path: livePath.track(1),
    type: "Track",
    properties: {
      arrangement_clips: children(...clipIds),
      devices: children(),
    },
  });

  for (const [i, clipId] of clipIds.entries()) {
    registerMockObject(clipId, {
      path: livePath.track(1).arrangementClip(i),
      type: "Clip",
      properties: {
        name: `Arrangement ${String(i)}`,
        is_midi_clip: 1,
        is_arrangement_clip: 1,
        start_time: 16 + i * 16,
        end_time: 32 + i * 16,
        length: 16,
        signature_numerator: 4,
        signature_denominator: 4,
        start_marker: 0,
        end_marker: 16,
        loop_start: 0,
        loop_end: 16,
      },
    });
  }
}

describe("readClip arrangement build budget", () => {
  beforeEach(setupArrangementTrack);

  it("scans the track's arrangement clips once to find one by position", () => {
    readClip({ path: "t1[13|1]", include: ["timing"] });

    // An arrangement clip has no slot to address, so a position is matched
    // against the track's clips one start_time at a time. The scan reads every
    // clip on the lane exactly once, whichever one matches, and the track it
    // lists them from is built once. A second pass would double both.
    //
    // The live_set the song meter reads is left unpinned: it is memoized per
    // request, and a test opens no request scope, so counting it here would
    // measure the harness.
    expect(resolves("id arrClip*")).toBe(ARRANGEMENT_CLIP_COUNT);
    expect(resolves("live_set tracks *")).toBe(1);
  });
});
