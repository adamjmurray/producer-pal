// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Sources run in call order, so a copy landing on a later source of the same
// call would destroy it before its turn. The call is refused before any copy.
// A copy onto an earlier source lands after that source's turn, so it goes.

import { describe, expect, it } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  lookupMockObject,
  registerMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import {
  duplicateToLanes,
  type LaneCopyEntry,
  registerLaneSource,
  registerLiveSet,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import { updateClipMock } from "../../setup.ts";

/**
 * The refusal for a copy landing on another source.
 * @param destination - Where the copy was headed
 * @param victim - The source it would overwrite, as the call named it
 * @returns The error message
 */
function overwrite(destination: string, victim: string): string {
  return (
    `a copy to "${destination}" would overwrite ${victim}, another source ` +
    "of this call; list it before this one, or duplicate it in its own " +
    "call first"
  );
}

/**
 * A MIDI session clip, and the slot holding it, which records any copy out.
 * @param id - The clip's id
 * @param trackIndex - Its track
 * @returns The slot's mock
 */
function registerSlotClip(
  id: string,
  trackIndex: number,
): RegisteredMockObject {
  registerMockObject(id, {
    path: livePath.track(trackIndex).clipSlot(0).clip(),
    properties: { is_midi_clip: 1, length: 16 },
  });

  return registerMockObject(`slot-${trackIndex}`, {
    path: livePath.track(trackIndex).clipSlot(0),
    properties: { has_clip: 1 },
    methods: { duplicate_clip_to: () => null },
  });
}

/**
 * A MIDI arrangement clip.
 * @param id - The clip's id
 * @param path - Where it sits
 * @param start - Its start, in beats
 * @param end - Its end, in beats
 * @param length - Its loop length, when it loops short of its end
 */
function registerArrangementClip(
  id: string,
  path: PathLike,
  start: number,
  end: number,
  length = end - start,
): void {
  registerMockObject(id, {
    path,
    properties: {
      is_midi_clip: 1,
      is_arrangement_clip: 1,
      start_time: start,
      end_time: end,
      length,
    },
  });
}

/**
 * Track 0, a MIDI track whose arrangement duplicate lands a fresh clip, and
 * the 4/4 song the positions are read in.
 * @returns Track 0's mock
 */
function registerTrack0(): RegisteredMockObject {
  let copies = 0;

  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  return registerMockObject("track0", {
    path: livePath.track(0),
    properties: { has_midi_input: 1, is_frozen: 0 },
    methods: {
      duplicate_clip_to_arrangement: () => {
        const id = `copy${copies}`;

        registerMockObject(id, {
          path: livePath.track(0).arrangementClip(10 + copies++),
          properties: { is_arrangement_clip: 1 },
        });

        return ["id", id];
      },
    },
  });
}

/**
 * Assert a track got no arrangement copy.
 * @param track - The track's mock
 */
function expectNoArrangementCopy(track: RegisteredMockObject): void {
  expect(track.call).not.toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    expect.anything(),
    expect.anything(),
  );
  expect(updateClipMock).not.toHaveBeenCalled();
}

describe("duplicate - a copy onto another source", () => {
  describe("clip slots", () => {
    it("refuses a copy onto a later source before any copy", async () => {
      const slots = [
        registerSlotClip("clipA", 0),
        registerSlotClip("clipB", 1),
      ];

      await expect(
        duplicate({ type: "clip", id: "clipA,clipB", toPath: "t1/s0,t2/s0" }),
      ).rejects.toThrow(overwrite("t1/s0", 'id "clipB"'));

      for (const slot of slots) {
        expect(slot.call).not.toHaveBeenCalledWith(
          "duplicate_clip_to",
          expect.anything(),
        );
      }
    });

    it("copies onto an earlier source once its turn has run", async () => {
      const [slotA, slotB] = [
        registerSlotClip("clipA", 0),
        registerSlotClip("clipB", 1),
      ];

      await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t2/s0,t0/s0",
      });

      expect(slotA.call).toHaveBeenCalledWith(
        "duplicate_clip_to",
        "id live_set/tracks/2/clip_slots/0",
      );
      expect(slotB.call).toHaveBeenCalledWith("duplicate_clip_to", "id slot-0");
    });
  });

  describe("arrangement", () => {
    // The natural "shift a row" call: A's copy clears B before B's turn.
    it("refuses a copy over a later source's span", async () => {
      registerArrangementClip(
        "clipA",
        livePath.track(0).arrangementClip(0),
        0,
        16,
      );
      registerArrangementClip(
        "clipB",
        livePath.track(0).arrangementClip(1),
        16,
        32,
      );

      const track = registerTrack0();

      await expect(
        duplicate({
          type: "clip",
          id: "clipA,clipB",
          toPath: "t0[5|1],t0[9|1]",
        }),
      ).rejects.toThrow(overwrite("t0[5|1]", 'id "clipB"'));

      expectNoArrangementCopy(track);
    });

    it("copies over an earlier source's span once its turn has run", async () => {
      registerArrangementClip(
        "clipA",
        livePath.track(0).arrangementClip(0),
        0,
        16,
      );
      registerArrangementClip(
        "clipB",
        livePath.track(0).arrangementClip(1),
        16,
        32,
      );

      const track = registerTrack0();

      await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t0[9|1],t0[1|1]",
      });

      expect(track.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clipA",
        32,
      );
      expect(track.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clipB",
        0,
      );
    });

    it("copies when a copy only touches another source's start", async () => {
      registerArrangementClip(
        "clipA",
        livePath.track(0).arrangementClip(0),
        0,
        16,
      );
      registerArrangementClip(
        "clipB",
        livePath.track(0).arrangementClip(1),
        32,
        48,
      );

      const track = registerTrack0();

      await duplicate({
        type: "clip",
        id: "clipA,clipB",
        toPath: "t0[5|1],t0[13|1]",
      });

      expect(track.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clipA",
        16,
      );
      expect(track.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id clipB",
        48,
      );
    });

    // Without the length, A's copy would end at beat 8, well short of B.
    it("measures a copy by its arrangementLength", async () => {
      registerArrangementClip(
        "clipA",
        livePath.track(0).arrangementClip(0),
        0,
        4,
      );
      registerArrangementClip(
        "clipB",
        livePath.track(0).arrangementClip(1),
        16,
        32,
      );

      const track = registerTrack0();

      await expect(
        duplicate({
          type: "clip",
          id: "clipA,clipB",
          toPath: "t0[2|1],t0[9|1]",
          arrangementLength: "4bar",
        }),
      ).rejects.toThrow(overwrite("t0[2|1]", 'id "clipB"'));

      expectNoArrangementCopy(track);
    });

    // A length at or past the loop lands the whole 4-bar clip first, so the
    // copy at bar 5 clears into B even though it ends up 2 bars long.
    it("measures a looped copy by its full extent when it lands whole", async () => {
      registerArrangementClip(
        "clipA",
        livePath.track(0).arrangementClip(0),
        0,
        16,
        4,
      );
      registerArrangementClip(
        "clipB",
        livePath.track(0).arrangementClip(1),
        24,
        40,
      );

      const track = registerTrack0();

      await expect(
        duplicate({
          type: "clip",
          id: "clipA,clipB",
          toPath: "t0[5|1],t0[13|1]",
          arrangementLength: "2bar",
        }),
      ).rejects.toThrow(overwrite("t0[5|1]", 'id "clipB"'));

      expectNoArrangementCopy(track);
    });

    it("measures a session source by its clip length", async () => {
      // 16 beats long, so a copy at beat 8 reaches into B at beat 16.
      registerSlotClip("clipA", 1);
      registerArrangementClip(
        "clipB",
        livePath.track(0).arrangementClip(0),
        16,
        32,
      );

      const track = registerTrack0();

      await expect(
        duplicate({
          type: "clip",
          id: "clipA,clipB",
          toPath: "t0[3|1],t0[9|1]",
        }),
      ).rejects.toThrow(overwrite("t0[3|1]", 'id "clipB"'));

      expectNoArrangementCopy(track);
    });

    it("refuses a copy onto a take-lane source before making a lane", async () => {
      registerLiveSet();
      registerArrangementClip(
        "clipA",
        livePath.track(0).arrangementClip(0),
        0,
        16,
      );
      registerArrangementClip(
        "clipB",
        livePath.track(0).takeLane(0).arrangementClip(0),
        0,
        16,
      );

      const track = registerTakeLaneTrack({ trackIndex: 0 });

      await expect(
        duplicate({
          type: "clip",
          id: "clipA,clipB",
          toPath: "t0/l0[1|1],t1[1|1]",
        }),
      ).rejects.toThrow(overwrite("t0/l0[1|1]", 'id "clipB"'));

      expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    });
  });

  describe("lane copies", () => {
    it("refuses a lane copied over another source lane's clips", async () => {
      registerLiveSet();
      registerTakeLaneTrack({
        trackIndex: 0,
        initialLanes: 2,
        initialLaneClips: [[{ start: 0, end: 4 }], [{ start: 2, end: 6 }]],
      });

      const track1 = registerTakeLaneTrack({ trackIndex: 1 });

      await expect(
        duplicateToLanes({ path: "t0/l0,t0/l1", toPath: "t0/l1,t1/l0" }),
      ).rejects.toThrow(overwrite("t0/l1", 'path "t0/l1"'));

      expect(
        lookupMockObject(undefined, livePath.track(0).takeLane(1))?.call,
      ).not.toHaveBeenCalledWith(
        "create_midi_clip",
        expect.anything(),
        expect.anything(),
      );
      expect(track1.call).not.toHaveBeenCalledWith("create_take_lane");
    });

    it("refuses a lane promoted over another source track's clips", async () => {
      registerLaneSource([0], {}, { end_time: 4 });
      registerArrangementClip(
        "clipB",
        livePath.track(1).arrangementClip(0),
        2,
        6,
      );
      registerMockObject("track1", {
        path: livePath.track(1),
        properties: {
          has_midi_input: 1,
          is_foldable: 0,
          take_lanes: children(),
          arrangement_clips: children("clipB"),
        },
      });

      const track2 = registerTakeLaneTrack({ trackIndex: 2 });

      await expect(
        duplicateToLanes({ path: "t0/l0,t1", toPath: "t1,t2/l0" }),
      ).rejects.toThrow(overwrite("t1", 'path "t1"'));

      expect(track2.call).not.toHaveBeenCalledWith("create_take_lane");
    });

    it("copies a lane over an earlier source lane once its turn has run", async () => {
      registerLiveSet();
      registerTakeLaneTrack({
        trackIndex: 0,
        initialLanes: 2,
        initialLaneClips: [[{ start: 0, end: 4 }], [{ start: 2, end: 6 }]],
      });
      registerTakeLaneTrack({ trackIndex: 1 });

      const result = await duplicateToLanes<LaneCopyEntry[]>({
        path: "t0/l0,t0/l1",
        toPath: "t1/l0,t0/l0",
      });

      expect(result.map((entry) => entry.path)).toStrictEqual([
        "t1/l0",
        "t0/l0",
      ]);
    });

    it("copies onto another source's lane where its clips miss", async () => {
      registerLiveSet();
      registerTakeLaneTrack({
        trackIndex: 0,
        initialLanes: 2,
        initialLaneClips: [[{ start: 0, end: 4 }], [{ start: 4, end: 8 }]],
      });
      registerTakeLaneTrack({ trackIndex: 1 });

      const result = await duplicateToLanes<LaneCopyEntry[]>({
        path: "t0/l0,t0/l1",
        toPath: "t0/l1,t1/l0",
      });

      expect(result.map((entry) => entry.path)).toStrictEqual([
        "t0/l1",
        "t1/l0",
      ]);
    });
  });
});
