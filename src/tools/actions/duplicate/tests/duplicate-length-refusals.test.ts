// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A bad arrangementLength, or a per-copy list that doesn't match the copies,
// refuses the whole call before any copy or take lane is made. Only clip and
// scene copies to the arrangement read it: elsewhere it warns and can't refuse.

import { beforeEach, describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  createStandardMidiClipMock,
  registerClipSlot,
  registerMockObject,
  registerTrackCopySet,
  setupArrangementSceneMocks,
  setupSessionSceneMocks,
  type RegisteredMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import {
  duplicateToLanes,
  registerArrangementSource,
  registerLiveSet,
  registerMainLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { createShortenedClipInHoldingMock, updateClipMock } from "./setup.ts";

const BAD_FORMAT = "Invalid duration format";

describe("duplicate - arrangementLength refused before any write", () => {
  it.each([
    ["an entry that won't parse", "2bar,2bar,bogus", BAD_FORMAT],
    [
      "a zero entry",
      "2bar,0bar,2bar",
      'arrangementLength must be positive, got "0bar"',
    ],
  ])("refuses %s in a per-copy list", async (_label, length, message) => {
    const track0 = registerSessionSource();

    await expect(
      duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "2|1,4|1,6|1",
        arrangementLength: length,
      }),
    ).rejects.toThrow(message);

    expectNoCopies(track0);
  });

  it("checks positivity in the song's meter", async () => {
    // A whole bar less a dotted half is one beat in 4/4 but nothing in 3/4.
    const track0 = registerSessionSource({ signature_numerator: 3 });

    await expect(
      duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "2|1,4|1",
        arrangementLength: "2bar,1bar-n/2d",
      }),
    ).rejects.toThrow('arrangementLength must be positive, got "1bar-n/2d"');

    expectNoCopies(track0);
  });

  it("refuses a bad entry for a later source before the first is copied", async () => {
    for (const [trackIndex, id] of ["clipA", "clipB"].entries()) {
      registerMockObject(id, {
        path: livePath.track(trackIndex).clipSlot(0).clip(),
        properties: { is_midi_clip: 1, length: 4 },
      });
    }

    const tracks = [0, 1].map((index) => {
      registerArrangementClip(index, 0, 16);

      return registerTrackWithArrangementDup(index, { has_midi_input: 1 });
    });

    registerMockObject("live_set", { path: livePath.liveSet });

    await expect(
      duplicate({
        type: "clip",
        id: "clipA,clipB",
        arrangementStart: "5|1",
        arrangementLength: "2bar,bogus",
      }),
    ).rejects.toThrow(BAD_FORMAT);

    for (const track of tracks) {
      expectNoCopies(track);
    }
  });

  it("refuses a bad entry for a scene's later copy before the first", async () => {
    setupArrangementSceneMocks(1);
    registerClipSlot(0, 0, true, createStandardMidiClipMock());

    const track0 = registerTrackWithArrangementDup(0);

    registerArrangementClip(0, 0, 16);

    await expect(
      duplicate({
        type: "scene",
        id: "scene1",
        arrangementStart: "5|1,9|1",
        arrangementLength: "1bar,bogus",
      }),
    ).rejects.toThrow(BAD_FORMAT);

    expectNoCopies(track0);
  });

  it("refuses a scene's bad entry when count makes the copies", async () => {
    setupArrangementSceneMocks(1);
    registerClipSlot(0, 0, true, createStandardMidiClipMock());

    const track0 = registerTrackWithArrangementDup(0);

    registerArrangementClip(0, 0, 16);

    await expect(
      duplicate({
        type: "scene",
        id: "scene1",
        arrangementStart: "5|1",
        count: 2,
        arrangementLength: "1bar,bogus",
      }),
    ).rejects.toThrow(BAD_FORMAT);

    expectNoCopies(track0);
  });

  it.each([["bogus"], ["2bar,bogus"]])(
    "refuses %s before the arrangement copy beside a refused slot",
    async (length) => {
      const { slot, track1 } = registerMixedSources();

      await expect(
        duplicate({
          type: "clip",
          id: "clipA,clipB",
          toPath: "t2/s0,t1[5|1]",
          arrangementLength: length,
        }),
      ).rejects.toThrow(BAD_FORMAT);

      expectNoCopies(track1);
      expect(slot.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to",
        expect.anything(),
      );
      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("arrangementLength ignored"),
      );
    },
  );

  it("refuses a bad length on a refused slot entry before the first copy", async () => {
    const { slot, track1 } = registerMixedSources();

    await expect(
      duplicate({
        type: "clip",
        id: "clipB,clipA",
        toPath: "t1[5|1],t2/s0",
        arrangementLength: "2bar,bogus",
      }),
    ).rejects.toThrow(BAD_FORMAT);

    expectNoCopies(track1);
    expect(slot.call).not.toHaveBeenCalledWith(
      "duplicate_clip_to",
      expect.anything(),
    );
  });

  it("leaves a length alone when every copy goes to a slot", async () => {
    const { slot } = registerMixedSources();

    await duplicate({
      type: "clip",
      id: "clipA",
      toPath: "t2/s0",
      arrangementLength: "bogus",
    });

    expect(slot.call).toHaveBeenCalledWith(
      "duplicate_clip_to",
      expect.anything(),
    );
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("arrangementLength ignored"),
    );
  });

  it("refuses a bad value before making a take lane", async () => {
    const track = registerLaneFixture();

    await expect(
      duplicate({
        type: "clip",
        id: "src_clip",
        toPath: "t0/l0[9|1],t0[17|1]",
        arrangementLength: "banana",
      }),
    ).rejects.toThrow(BAD_FORMAT);

    expectNoLaneWrites(track);
  });

  it.each([
    ["arrangementLength", { arrangementLength: "1bar,2bar,3bar" }],
    ["name", { name: "a,b,c" }],
    ["color", { color: "#FF0000,#00FF00,#0000FF" }],
  ])(
    "refuses a %s list that doesn't match the copies before making a take lane",
    async (param, extra) => {
      const track = registerLaneFixture();

      await expect(
        duplicate({
          type: "clip",
          id: "src_clip",
          toPath: "t0/l0[9|1],t0[17|1]",
          ...extra,
        }),
      ).rejects.toThrow(
        `this call names 2 copies but ${param} names 3 entries`,
      );

      expectNoLaneWrites(track);
    },
  );
});

const IGNORED =
  "arrangementLength ignored: only clip and scene copies to the arrangement use it";

/**
 * The arrangementLength warnings the call raised.
 * @returns Every warning that names arrangementLength
 */
function lengthWarnings(): string[] {
  return capturedWarnings().filter((warning) =>
    warning.includes("arrangementLength"),
  );
}

describe("duplicate - arrangementLength where no copy reads it", () => {
  beforeEach(() => {
    clearCapturedWarnings();
  });

  it("warns once for track copies, whatever the list length", async () => {
    const { liveSet } = registerTrackCopySet(["track1"]);

    await duplicate({
      type: "track",
      id: "track1",
      count: 2,
      arrangementLength: "1bar,2bar,3bar",
    });

    expect(liveSet.call).toHaveBeenCalledTimes(2);
    expect(lengthWarnings()).toStrictEqual([`${IGNORED} (type "track")`]);
  });

  it("warns for session scene copies, whatever the list length", async () => {
    const liveSet = setupSessionSceneMocks();

    await duplicate({
      type: "scene",
      id: "scene1",
      count: 2,
      arrangementLength: "1bar,2bar,3bar",
    });

    expect(liveSet.call).toHaveBeenCalledTimes(2);
    expect(lengthWarnings()).toStrictEqual([`${IGNORED} (type "scene")`]);
  });

  it("warns for a track copied onto a take lane", async () => {
    registerMainLaneSource([0]);
    registerTakeLaneTrack({ trackIndex: 1 });

    await duplicateToLanes({
      id: "src_track",
      toPath: "t1/l+,t1/l+",
      arrangementLength: "1bar,2bar,3bar",
    });

    expect(lengthWarnings()).toStrictEqual([`${IGNORED} (type "track")`]);
  });

  it("doesn't refuse a clip copy to a slot over the list length", async () => {
    const { slot } = registerMixedSources();

    registerMockObject("live_set/tracks/2/clip_slots/1", {
      path: livePath.track(2).clipSlot(1),
      properties: { has_clip: 0 },
    });

    await duplicate({
      type: "clip",
      id: "clipA",
      toPath: "t2/s0,t2/s1",
      arrangementLength: "1bar,2bar,3bar",
    });

    expect(slot.call).toHaveBeenCalledTimes(2);
    expect(lengthWarnings()).toHaveLength(1);
  });
});

/**
 * A session clip on track 0, a track that can take arrangement copies, and a
 * live_set with the given song meter.
 * @param meter - Song meter properties, 4/4 when omitted
 * @returns Track 0's mock
 */
function registerSessionSource(
  meter: Record<string, number> = {},
): RegisteredMockObject {
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: { is_midi_clip: 1, length: 4, looping: 1 },
  });
  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      ...meter,
    },
  });
  registerArrangementClip(0, 0, 4);

  return registerTrackWithArrangementDup(0);
}

/**
 * clipA in track 0's first slot, copyable into an empty slot t2/s0, and clipB
 * in track 1's, whose track takes arrangement copies.
 * @returns clipA's slot, which records the slot copy, and track 1
 */
function registerMixedSources(): {
  slot: RegisteredMockObject;
  track1: RegisteredMockObject;
} {
  registerMockObject("clipA", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: { is_midi_clip: 1 },
  });
  registerMockObject("clipB", {
    path: livePath.track(1).clipSlot(0).clip(),
    properties: { is_midi_clip: 1, length: 4 },
  });
  registerMockObject("live_set/tracks/2", {
    path: livePath.track(2),
    properties: { has_midi_input: 1, is_frozen: 0 },
  });
  registerMockObject("live_set/tracks/2/clip_slots/0", {
    path: livePath.track(2).clipSlot(0),
    properties: { has_clip: 0 },
  });
  registerMockObject("live_set", { path: livePath.liveSet });
  registerArrangementClip(1, 0, 16);
  const track1 = registerTrackWithArrangementDup(1, { has_midi_input: 1 });
  const slot = registerMockObject("live_set/tracks/0/clip_slots/0", {
    path: livePath.track(0).clipSlot(0),
    properties: { has_clip: 1 },
    methods: { duplicate_clip_to: () => null },
  });

  return { slot, track1 };
}

/**
 * A main-lane arrangement source on track 0, which has no take lanes yet.
 * @returns Track 0's mock
 */
function registerLaneFixture(): RegisteredMockObject {
  registerLiveSet();
  registerArrangementSource(true);

  return registerTakeLaneTrack({ initialLanes: 0 });
}

/**
 * Assert no arrangement copy was made on a track.
 * @param track - The track's mock
 */
function expectNoCopies(track: RegisteredMockObject): void {
  expect(track.call).not.toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    expect.anything(),
    expect.anything(),
  );
  expect(updateClipMock).not.toHaveBeenCalled();
  expect(createShortenedClipInHoldingMock).not.toHaveBeenCalled();
}

/**
 * Assert a track got no take lane and no clip, on any lane.
 * @param track - The track's mock
 */
function expectNoLaneWrites(track: RegisteredMockObject): void {
  expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  expectNoCopies(track);
  expect(track.call).not.toHaveBeenCalledWith(
    "create_midi_clip",
    expect.anything(),
    expect.anything(),
  );
}
