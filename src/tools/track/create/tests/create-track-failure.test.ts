// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  failCall,
  failOnCreated,
  hookCalls,
  registerTracks,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { createTrack } from "../create-track.ts";

const OUT_OF_TIME = "the request ran out of time; re-run for this path";

/**
 * A Live Set with two tracks, where the nth `create_midi_track` throws.
 * @param nth - Which create fails, counting from 1
 * @returns The Live Set
 */
function failingCreate(nth: number): RegisteredMockObject {
  registerTracks(2);

  const liveSet = lookupMockObject("live_set") as RegisteredMockObject;

  failCall(liveSet, /^create_midi_track$/, nth);

  return liveSet;
}

/**
 * The indexes the Live Set was asked to create tracks at, in order.
 * @param liveSet - The Live Set
 * @returns One index per create call
 */
function createdAt(liveSet: RegisteredMockObject): unknown[] {
  return liveSet.call.mock.calls
    .filter(([name]) => name === "create_midi_track")
    .map(([, index]) => index);
}

/**
 * A Live Set where each return track Live makes can't be armed, as in Live.
 * @returns The Live Set
 */
function unarmableReturns(): RegisteredMockObject {
  registerTracks(2);

  const liveSet = lookupMockObject("live_set") as RegisteredMockObject;

  hookCalls(liveSet, /^create_return_track$/, {
    after: (_nth, _args, result) => {
      const made = lookupMockObject(String((result as string[])[1]));

      (made as RegisteredMockObject).properties.can_be_armed = 0;
    },
  });

  return liveSet;
}

describe("createTrack when Live fails partway", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives the failing insert its own entry and plans the rest from what is there", () => {
    const liveSet = failingCreate(2);

    expect(createTrack({ path: "t2,t2,t2" })).toStrictEqual([
      { id: expect.any(String), path: "t2" },
      { path: "t2", ok: false, detail: LIVE_FAILURE },
      { id: expect.any(String), path: "t3" },
    ]);
    // The third was planned to land after two others; only one did.
    expect(createdAt(liveSet)).toStrictEqual([2, 3, 3]);
  });

  it("names earlier tracks where they sit when a later insert failed", () => {
    // t0 was meant to push the track named first down a slot.
    failingCreate(2);

    expect(createTrack({ path: "t1,t0" })).toStrictEqual([
      { id: expect.any(String), path: "t1" },
      { path: "t0", ok: false, detail: LIVE_FAILURE },
    ]);
  });

  it("keeps a track's entry when it was made and then would not take its name", () => {
    registerTracks(2);

    const liveSet = lookupMockObject("live_set") as RegisteredMockObject;

    failOnCreated(liveSet, /^create_midi_track$/, 2);

    expect(createTrack({ path: "t2,t2,t2", name: "A,B,C" })).toStrictEqual([
      { id: expect.any(String), path: "t2" },
      {
        id: expect.any(String),
        path: "t3",
        detail: `${LIVE_FAILURE}; already changed: track created`,
      },
      { id: expect.any(String), path: "t4" },
    ]);
    // Nothing failed to land, so nothing was planned again.
    expect(createdAt(liveSet)).toStrictEqual([2, 3, 4]);
  });

  it("throws when the one track's insert fails", () => {
    failingCreate(1);

    expect(() => createTrack({ path: "t+" })).toThrow(LIVE_FAILURE);
  });

  it("skips a track Live did not make, and throws when it was the only one", () => {
    registerTracks(2);

    const liveSet = lookupMockObject("live_set") as RegisteredMockObject;

    liveSet.call.mockImplementationOnce(() => null);

    expect(createTrack({ path: "t+,t+" })).toStrictEqual([
      { path: "t+", ok: false, detail: "Live did not create the track" },
      { id: expect.any(String), path: "t2" },
    ]);

    registerTracks(2);
    (
      lookupMockObject("live_set") as RegisteredMockObject
    ).call.mockImplementationOnce(() => null);

    expect(() => createTrack({ path: "t+" })).toThrow(
      "Live did not create the track",
    );
  });

  it("throws the same reason for a return track Live did not make", () => {
    registerTracks(2);
    (
      lookupMockObject("live_set") as RegisteredMockObject
    ).call.mockImplementationOnce(() => null);

    expect(() => createTrack({ path: "rt+" })).toThrow(
      "Live did not create the track",
    );
  });

  it("leaves the tracks the deadline never reached as skips", () => {
    const start = 1_000_000;
    let now = start;

    vi.spyOn(Date, "now").mockImplementation(() => now);
    registerTracks(2);

    const liveSet = lookupMockObject("live_set") as RegisteredMockObject;

    hookCalls(liveSet, /^create_midi_track$/, {
      after: () => {
        // The first create uses up the time.
        now = start + 5000;
      },
    });

    expect(
      createTrack({ path: "t0,t+,t+" }, { deadline: start + 1000 }),
    ).toStrictEqual([
      { id: expect.any(String), path: "t0" },
      { path: "t+", ok: false, detail: OUT_OF_TIME },
      { path: "t+", ok: false, detail: OUT_OF_TIME },
    ]);
    expect(createdAt(liveSet)).toStrictEqual([0]);
  });

  it("names the return track a refused arm was asked of", () => {
    unarmableReturns();

    expect(createTrack({ path: "rt+", arm: true })).toStrictEqual({
      id: expect.any(String),
      path: "rt0",
      detail: "arm had no effect: return, main and group tracks can't be armed",
    });
  });

  it("notes arm off on a return track as already off", () => {
    unarmableReturns();

    expect(createTrack({ path: "rt+", arm: false })).toStrictEqual({
      id: expect.any(String),
      path: "rt0",
      detail: "arm already off: return, main and group tracks can't be armed",
    });
  });

  it("numbers each return track after the ones that really landed", () => {
    registerTracks(2);

    const liveSet = lookupMockObject("live_set") as RegisteredMockObject;

    failCall(liveSet, /^create_return_track$/, 1);

    expect(createTrack({ path: "rt+,rt+" })).toStrictEqual([
      { path: "rt+", ok: false, detail: LIVE_FAILURE },
      { id: expect.any(String), path: "rt0" },
    ]);
  });
});
