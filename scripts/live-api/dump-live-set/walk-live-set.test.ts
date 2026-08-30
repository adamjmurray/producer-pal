// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fakeInfo,
  installFakeLom,
  type FakeLom,
} from "./dump-live-set-test-helpers.ts";
import { createBatchContext } from "./live-api-batch.ts";
import { type LiveSetDump, type WalkOptions } from "./dump-types.ts";
import { walkLiveSet } from "./walk-live-set.ts";

const CLIP_PATH = "live_set tracks 0 clip_slots 1 clip";

// Live reports "View" for Song.View, Track.View and Device.View alike, and they
// expose different properties. TRACK_VIEW is served per object to reproduce it.
const TRACK_VIEW = fakeInfo("View", ["property is_collapsed bool"]);

// Same class, same path shape, different listing — a Drum Rack and an
// Instrument Rack are both "RackDevice" and only one of them lists drum_pads.
const TRACK_VIEW_PLUS = fakeInfo("View", [
  "property is_collapsed bool",
  "property selected_device int",
]);

const TYPES: Record<string, string> = {
  Song: fakeInfo("Song", [
    // Before `tracks` on purpose: the walk reaches a track through the alias
    // first, and still has to record it under the path Live reports.
    "children visible_tracks Track",
    "children tracks Track",
    "child master_track Track",
    "child view View",
    "property tempo float",
    "function start_playing",
  ]),
  Track: fakeInfo("Track", [
    "children clip_slots ClipSlot",
    "child canonical_parent Song",
    "child view View",
    "property name unicode",
  ]),
  ClipSlot: fakeInfo("ClipSlot", ["child clip Clip", "property has_clip bool"]),
  Clip: fakeInfo("Clip", [
    "property name unicode",
    "property file_path unicode",
  ]),
  View: fakeInfo("View", [
    "child selected_track Track",
    "property draw_mode int",
  ]),
};

/**
 * A small Set with the shapes that decide the walk: a list child, a single
 * child, an empty slot, a back-pointer, two routes to the same track, and
 * three objects that all call themselves View.
 * @returns A fresh LOM, since the dumper edits what it reads back
 */
function fakeLiveSet(): FakeLom {
  return {
    types: TYPES,
    aliases: {
      "live_set visible_tracks 0": "live_set tracks 0",
      "live_set visible_tracks 1": "live_set tracks 1",
      "live_set view selected_track": "live_set tracks 0",
    },
    objects: {
      live_set: {
        id: "1",
        type: "Song",
        properties: {
          tempo: [120],
          visible_tracks: ["id", 2, "id", 3],
          tracks: ["id", 2, "id", 3],
          master_track: ["id", 9],
          view: ["id", 10],
        },
      },
      "live_set tracks 0": {
        id: "2",
        type: "Track",
        properties: {
          name: ["Drums"],
          clip_slots: ["id", 4, "id", 5],
          canonical_parent: ["id", 1],
          view: ["id", 11],
        },
      },
      "live_set tracks 1": {
        id: "3",
        type: "Track",
        properties: {
          name: ["Bass"],
          clip_slots: [],
          canonical_parent: ["id", 1],
          view: ["id", 12],
        },
      },
      "live_set master_track": {
        id: "9",
        type: "Track",
        properties: {
          name: ["Master"],
          clip_slots: [],
          canonical_parent: ["id", 1],
          view: ["id", 13],
        },
      },
      "live_set view": {
        id: "10",
        type: "View",
        properties: { selected_track: ["id", 2], draw_mode: [0] },
      },
      "live_set tracks 0 view": {
        id: "11",
        type: "View",
        info: TRACK_VIEW,
        properties: { is_collapsed: [0] },
      },
      "live_set tracks 1 view": {
        id: "12",
        type: "View",
        info: TRACK_VIEW_PLUS,
        properties: { is_collapsed: [1], selected_device: [3] },
      },
      "live_set master_track view": {
        id: "13",
        type: "View",
        info: TRACK_VIEW,
        properties: { is_collapsed: [0] },
      },
      "live_set tracks 0 clip_slots 0": {
        id: "4",
        type: "ClipSlot",
        properties: { has_clip: [0], clip: ["id", 0] },
      },
      "live_set tracks 0 clip_slots 1": {
        id: "5",
        type: "ClipSlot",
        properties: { has_clip: [1], clip: ["id", 6] },
      },
      [CLIP_PATH]: {
        id: "6",
        type: "Clip",
        properties: {
          name: ["Beat"],
          file_path: ["/Users/someone/Music/Kick.wav"],
        },
      },
    },
  };
}

/**
 * Walk a fake LOM with the dumper's defaults.
 * @param lom - The LOM to serve
 * @param overrides - Options to change for this walk
 * @returns The finished dump
 */
async function runWalk(
  lom: FakeLom,
  overrides: Partial<WalkOptions> = {},
): Promise<LiveSetDump> {
  installFakeLom(lom);

  return await walkLiveSet(createBatchContext("http://fake"), {
    roots: ["live_set"],
    liveVersion: "12.4.3",
    skipChildren: new Set(),
    maxObjects: 1000,
    redactPaths: true,
    log: () => undefined,
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("walkLiveSet", () => {
  it("records every reachable object, keyed by the path a tool would build", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(Object.keys(dump.objects).toSorted()).toStrictEqual([
      "live_set",
      "live_set master_track",
      "live_set master_track view",
      "live_set tracks 0",
      "live_set tracks 0 clip_slots 0",
      "live_set tracks 0 clip_slots 1",
      CLIP_PATH,
      "live_set tracks 0 view",
      "live_set tracks 1",
      "live_set tracks 1 view",
      "live_set view",
    ]);
  });

  it("reads every property info names, not only the ones tools use", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(dump.objects["live_set tracks 0"]).toStrictEqual({
      id: "2",
      type: "Track",
      properties: {
        name: ["Drums"],
        clip_slots: ["id", 4, "id", 5],
        // Recorded even though the walk never follows it.
        canonical_parent: ["id", 1],
        view: ["id", 11],
      },
    });
  });

  it("records a second path to an object as an alias, not a second walk", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(dump.aliases).toStrictEqual({
      "live_set visible_tracks 0": "live_set tracks 0",
      "live_set visible_tracks 1": "live_set tracks 1",
      "live_set view selected_track": "live_set tracks 0",
    });
  });

  // The walk reaches the tracks through `visible_tracks` first. Keying by the
  // path that was asked for would file every track under a spelling no tool
  // builds, which is what real Live did to 96 clip slots reached via scenes.
  it("records an object under the path Live reports, whichever route found it", async () => {
    const dump = await runWalk(fakeLiveSet(), {
      roots: ["live_set view selected_track"],
    });

    expect(Object.keys(dump.objects)).toContain("live_set tracks 0");
    expect(dump.aliases["live_set view selected_track"]).toBe(
      "live_set tracks 0",
    );
  });

  // Live answers "View" for Song.View, Track.View and Device.View. Caching one
  // listing per type name read Song.View's properties off every one of them —
  // silent under-recording, which is the failure a fixture cannot survive.
  it("tells apart classes that share a type name", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(dump.objects["live_set tracks 0 view"]).toStrictEqual({
      id: "11",
      type: "View",
      typeKey: "View @ live_set tracks 0 view",
      properties: { is_collapsed: [0] },
    });

    expect(dump.objects["live_set view"]?.properties).toStrictEqual({
      selected_track: ["id", 2],
      draw_mode: [0],
    });
  });

  // The master track's view exposes the same properties, so it shares the
  // listing rather than adding another entry.
  it("shares one listing between objects that answer the same", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(dump.objects["live_set master_track view"]?.typeKey).toBe(
      "View @ live_set tracks 0 view",
    );
    expect(dump.objects["live_set tracks 0"]?.typeKey).toBeUndefined();
  });

  // Caching a listing per class-and-shape read a plain rack's listing onto a
  // real 128-pad Drum Rack and recorded none of its pads, silently.
  it("reads what each object's own info names, not a neighbour's", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(dump.objects["live_set tracks 1 view"]?.properties).toStrictEqual({
      is_collapsed: [1],
      selected_device: [3],
    });
    expect(dump.objects["live_set tracks 0 view"]?.properties).toStrictEqual({
      is_collapsed: [0],
    });
  });

  it("does not walk an empty clip slot's clip", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(dump.objects["live_set tracks 0 clip_slots 0 clip"]).toBeUndefined();
  });

  it("records one info listing per class, ignoring wrapped description prose", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(Object.keys(dump.types).toSorted()).toStrictEqual([
      "Clip",
      "ClipSlot",
      "Song",
      "Track",
      "View @ live_set tracks 0 view",
      "View @ live_set tracks 1 view",
      "View @ live_set view",
    ]);

    expect(dump.types.ClipSlot).toStrictEqual({
      children: { clip: { type: "Clip", list: false } },
      properties: { has_clip: "bool" },
      functions: [],
    });

    expect(dump.types.Song?.functions).toStrictEqual(["start_playing"]);
  });

  it("redacts absolute filesystem paths by default", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(dump.objects[CLIP_PATH]?.properties.file_path).toStrictEqual([
      "<redacted absolute path>",
    ]);
    expect(dump.meta.redactedValues).toBe(1);
  });

  it("keeps absolute paths when asked to", async () => {
    const dump = await runWalk(fakeLiveSet(), { redactPaths: false });

    expect(dump.objects[CLIP_PATH]?.properties.file_path).toStrictEqual([
      "/Users/someone/Music/Kick.wav",
    ]);
    expect(dump.meta.redactedValues).toBe(0);
  });

  it("skips the child names it was told to skip", async () => {
    const dump = await runWalk(fakeLiveSet(), {
      skipChildren: new Set(["clip_slots"]),
    });

    expect(dump.objects["live_set tracks 0 clip_slots 0"]).toBeUndefined();
    // The property is still read; only the walk stops.
    expect(
      dump.objects["live_set tracks 0"]?.properties.clip_slots,
    ).toStrictEqual(["id", 4, "id", 5]);
    expect(dump.meta.skippedChildren).toStrictEqual([
      "canonical_parent",
      "clip_slots",
    ]);
  });

  // A property that cannot be read must not cost the rest of the object: the
  // request carrying it fails as a whole, so the batch has to halve until the
  // one bad read is alone.
  it("records null for an unreadable property and keeps the rest", async () => {
    const lom = fakeLiveSet();

    lom.failing = new Set(["live_set tracks 0:name"]);

    const dump = await runWalk(lom);

    expect(dump.objects["live_set tracks 0"]?.properties).toStrictEqual({
      name: null,
      clip_slots: ["id", 4, "id", 5],
      canonical_parent: ["id", 1],
      view: ["id", 11],
    });
    expect(dump.meta.failedReads).toBe(1);
  });

  it("stops at the object cap and says the dump is incomplete", async () => {
    const dump = await runWalk(fakeLiveSet(), { maxObjects: 3 });

    expect(dump.meta.truncated).toBe(true);
    expect(dump.meta.objects).toBeLessThanOrEqual(3);
  });

  it("summarizes what it collected", async () => {
    const dump = await runWalk(fakeLiveSet());

    expect(dump.meta).toStrictEqual({
      generator: "scripts/live-api/dump-live-set",
      liveVersion: "12.4.3",
      roots: ["live_set"],
      objects: 11,
      aliases: 3,
      types: 7,
      failedReads: 0,
      truncated: false,
      redactedValues: 1,
      skippedChildren: ["canonical_parent"],
      // Request count tracks the walker's internals, not the dump's contract.
      requests: expect.any(Number),
    });
    expect(dump.meta.requests).toBeGreaterThan(0);
  });
});
