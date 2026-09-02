// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `id` and `path` naming several sources: the single-source logic runs once per
// source, in order, and the results are concatenated.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const SLOT_ID = /tracks\/(\d+)\/clip_slots\/(\d+)/;

/**
 * A session clip in scene 0 of its own track, whose `duplicate_clip_to` lands a
 * copy in whichever slot it is handed. The copy's id names both ends, so a test
 * can say which source reached which destination.
 * @param clipId - Id for the source clip
 * @param trackIndex - Track holding it
 */
function registerSlotSource(clipId: string, trackIndex: number): void {
  registerMockObject(clipId, {
    path: livePath.track(trackIndex).clipSlot(0).clip(),
    properties: { is_midi_clip: 1 },
  });
  registerMockObject(`live_set/tracks/${trackIndex}/clip_slots/0`, {
    path: livePath.track(trackIndex).clipSlot(0),
    properties: { has_clip: 1 },
    methods: {
      duplicate_clip_to: (destination: unknown) => {
        const [, track, scene] = SLOT_ID.exec(String(destination)) ?? [];

        registerMockObject(`${clipId}-in-t${track}s${scene}`, {
          path: livePath.track(Number(track)).clipSlot(Number(scene)).clip(),
        });

        return null;
      },
    },
  });
}

/**
 * An empty MIDI clip slot to copy into, and the track holding it.
 * @param trackIndex - Track index
 * @param sceneIndex - Scene index
 */
function registerEmptyClipSlot(trackIndex: number, sceneIndex: number): void {
  registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: livePath.track(trackIndex),
    properties: { has_midi_input: 1, is_frozen: 0 },
  });
  registerMockObject(`live_set/tracks/${trackIndex}/clip_slots/${sceneIndex}`, {
    path: livePath.track(trackIndex).clipSlot(sceneIndex),
    properties: { has_clip: 0 },
  });
}

/**
 * Two session clips to copy, on tracks 0 and 1, plus the empty slots named.
 * @param destinations - Destination slots, as [trackIndex, sceneIndex] pairs
 */
function registerTwoSlotSources(destinations: [number, number][]): void {
  mockNonExistentObjects();
  registerSlotSource("clipA", 0);
  registerSlotSource("clipB", 1);

  for (const [trackIndex, sceneIndex] of destinations) {
    registerEmptyClipSlot(trackIndex, sceneIndex);
  }
}

describe("duplicate - a list of sources", () => {
  describe("clip slots", () => {
    it("gives each source its own share of the destinations", async () => {
      registerTwoSlotSources([
        [2, 0],
        [3, 0],
      ]);

      const result = await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t2/s0,t3/s0",
      });

      expect(result).toStrictEqual([
        { id: "clipA-in-t2s0", path: "t2/s0" },
        { id: "clipB-in-t3s0", path: "t3/s0" },
      ]);
    });

    // The destinations are shared out against the source list, so a source that
    // vanished would change which slot every later one gets.
    it("refuses an empty id entry", async () => {
      registerTwoSlotSources([
        [2, 0],
        [3, 0],
      ]);

      await expect(
        duplicate({
          type: "clip",
          id: "clipA,,clipB",
          toPath: "t2/s0,t3/s0",
        }),
      ).rejects.toThrow('invalid id "clipA,,clipB" - it has an empty entry.');
    });

    // The lookup gets the list whole, so without this the caller is told the
    // source is the wrong type rather than that the id named no source.
    it("refuses an id of only commas", async () => {
      registerTwoSlotSources([[2, 0]]);

      await expect(
        duplicate({ type: "clip", id: ",", toPath: "t2/s0" }),
      ).rejects.toThrow('invalid id "," - it names nothing');
    });

    // One surviving source is forwarded whole rather than re-split, so the empty
    // entry used to travel with it and the lookup failed on a source that was
    // right there. It is refused up front now, before any of that.
    it("refuses a leading empty entry even when one source survives", async () => {
      registerTwoSlotSources([[2, 0]]);

      await expect(
        duplicate({ type: "clip", id: ",clipA", toPath: "t2/s0" }),
      ).rejects.toThrow('invalid id ",clipA" - it has an empty entry.');
    });

    it("splits the destinations evenly when there are more than sources", async () => {
      registerTwoSlotSources([
        [2, 0],
        [2, 1],
        [3, 0],
        [3, 1],
      ]);

      const result = await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t2/s0,t2/s1,t3/s0,t3/s1",
      });

      expect(result).toStrictEqual([
        { id: "clipA-in-t2s0", path: "t2/s0" },
        { id: "clipA-in-t2s1", path: "t2/s1" },
        { id: "clipB-in-t3s0", path: "t3/s0" },
        { id: "clipB-in-t3s1", path: "t3/s1" },
      ]);
    });

    // A slot holds one clip, so a source with no slot of its own is dropped
    // rather than written over the slot another source already claimed.
    it("skips the sources a short toPath doesn't reach", async () => {
      registerTwoSlotSources([[2, 0]]);

      const result = await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t2/s0",
      });

      expect(result).toStrictEqual({ id: "clipA-in-t2s0", path: "t2/s0" });
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(
          "toPath names 1 destination(s) for 2 sources, and each needs its own",
        ),
      );
    });

    it("warns about the destinations left over", async () => {
      registerTwoSlotSources([
        [2, 0],
        [3, 0],
        [4, 0],
      ]);

      await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t2/s0,t3/s0,t4/s0",
      });

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(
          "the last 1 toPath destination(s) went unused — 2 sources take 1 each",
        ),
      );
    });

    it("counts names and colors across every copy, not per source", async () => {
      registerTwoSlotSources([
        [2, 0],
        [3, 0],
      ]);

      await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t2/s0,t3/s0",
        name: "one,two",
        color: "#FF0000,#00FF00",
      });

      const copyA = registerMockObject("clipA-in-t2s0", {});
      const copyB = registerMockObject("clipB-in-t3s0", {});

      expect(copyA.set).toHaveBeenCalledWith("name", "one");
      expect(copyB.set).toHaveBeenCalledWith("name", "two");
    });

    // duplicate used to warn and label what it could, where the update tools
    // threw for the same mistake. Nothing has been copied yet when the first
    // source settles the total, so this is still refusable up front.
    it("refuses a name list that doesn't match the copies", async () => {
      registerTwoSlotSources([
        [2, 0],
        [3, 0],
      ]);

      await expect(
        duplicate({
          type: "clip",
          id: "clipA,clipB",
          toPath: "t2/s0,t3/s0",
          name: "one,two,three",
        }),
      ).rejects.toThrow("this call names 2 copies but name names 3 entries");
    });

    it("refuses an empty entry in a name list", async () => {
      registerTwoSlotSources([
        [2, 0],
        [3, 0],
      ]);

      await expect(
        duplicate({
          type: "clip",
          id: "clipA,clipB",
          toPath: "t2/s0,t3/s0",
          name: ",two",
        }),
      ).rejects.toThrow('invalid name ",two" - it has an empty entry');
    });
  });

  describe("sources named by path", () => {
    it("takes a path list in place of ids", async () => {
      registerTwoSlotSources([
        [2, 0],
        [3, 0],
      ]);

      const result = await duplicate({
        type: "clip",
        path: "t0/s0,t1/s0",
        toPath: "t2/s0,t3/s0",
      });

      expect(result).toStrictEqual([
        { id: "clipA-in-t2s0", path: "t2/s0" },
        { id: "clipB-in-t3s0", path: "t3/s0" },
      ]);
    });

    // They name different objects, so they add up rather than conflicting.
    it("adds the paths onto the ids", async () => {
      registerTwoSlotSources([
        [2, 0],
        [3, 0],
      ]);

      const result = await duplicate({
        type: "clip",
        id: "clipA",
        path: "t1/s0",
        toPath: "t2/s0,t3/s0",
      });

      expect(result).toStrictEqual([
        { id: "clipA-in-t2s0", path: "t2/s0" },
        { id: "clipB-in-t3s0", path: "t3/s0" },
      ]);
    });

    // Every copy already made is one the caller has to clean up by hand, so a
    // source that can't be found stops the call instead of shrinking it.
    it("refuses a path that names no source", async () => {
      registerTwoSlotSources([[2, 0]]);

      await expect(
        duplicate({ type: "clip", path: "t9/s0", toPath: "t2/s0" }),
      ).rejects.toThrow(
        'duplicate failed: nothing to duplicate at path "t9/s0"',
      );
    });
  });

  describe("clips to the arrangement", () => {
    // The headline case: one position, every source landing on its own track.
    it("drops every source at the same position on its own track", async () => {
      registerMockObject("clipA", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });
      registerMockObject("clipB", {
        path: livePath.track(1).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });
      registerTrackWithArrangementDup(0, { has_midi_input: 1 });
      registerTrackWithArrangementDup(1, { has_midi_input: 1 });
      registerArrangementClip(0, 0, 16);
      registerArrangementClip(1, 0, 16);

      const result = await duplicate({
        type: "clip",
        id: "clipA,clipB",
        arrangementStart: "5|1",
      });

      expect(result).toStrictEqual([
        {
          id: "live_set tracks 0 arrangement_clips 0",
          path: "t0",
          arrangementStart: "5|1",
        },
        {
          id: "live_set tracks 1 arrangement_clips 0",
          path: "t1",
          arrangementStart: "5|1",
        },
      ]);
      // A genuine row: each source lands on its own track, so no collision.
      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("later ones will overwrite earlier ones"),
      );
    });

    // toPath is broadcast whole to every source in this mode (see
    // planSources) — never split per source — so a named toPath shared by
    // several sources always piles them onto the same spots, however many
    // positions the list names.
    it("warns when a container toPath is broadcast to every source", async () => {
      registerMockObject("clipA", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });
      registerMockObject("clipB", {
        path: livePath.track(1).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });

      const track2 = registerTrackWithArrangementDup(2, { has_midi_input: 1 });

      for (const clipIndex of [0, 1, 2, 3]) {
        registerArrangementClip(2, clipIndex, 16);
      }

      const result = await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t2",
        arrangementStart: "5|1,9|1",
      });

      expect(result).toHaveLength(4);
      expect(track2.call).toHaveBeenCalledTimes(4);
      // Each source writes both "t2" positions, so clipA and clipB collide at
      // 5|1 and again at 9|1 — a pile, not a row.
      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(
          '2 clips duplicated to "t2" at the same position',
        ),
      );
    });

    // Each source is placed on its own, with no view of the others, so nothing
    // downstream can see that they all land on the same span.
    it("warns when every source lands on one track at one position", async () => {
      registerMockObject("clipA", {
        path: livePath.track(0).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });
      registerMockObject("clipB", {
        path: livePath.track(1).clipSlot(0).clip(),
        properties: { is_midi_clip: 1 },
      });
      registerTrackWithArrangementDup(2, { has_midi_input: 1 });

      for (const clipIndex of [0, 1]) {
        registerArrangementClip(2, clipIndex, 16);
      }

      await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t2",
        arrangementStart: "5|1",
      });

      expect(capturedWarnings()).toContainEqual(
        expect.stringContaining(
          '2 clips duplicated to "t2" at the same position',
        ),
      );
    });
  });

  describe("tracks", () => {
    it("makes count copies of every source", async () => {
      registerMockObject("track1", { path: livePath.track(0) });
      registerMockObject("track2", { path: livePath.track(4) });

      for (const trackIndex of [1, 2, 5, 6]) {
        registerMockObject(`live_set/tracks/${trackIndex}`, {
          path: livePath.track(trackIndex),
          properties: { devices: [], clip_slots: [], arrangement_clips: [] },
        });
      }

      const result = await duplicate({
        type: "track",
        id: "track1,track2",
        count: 2,
        name: "a,b,c,d",
      });

      expect(result).toStrictEqual([
        expect.objectContaining({ trackIndex: 1 }),
        expect.objectContaining({ trackIndex: 2 }),
        expect.objectContaining({ trackIndex: 5 }),
        expect.objectContaining({ trackIndex: 6 }),
      ]);
    });
  });
});
