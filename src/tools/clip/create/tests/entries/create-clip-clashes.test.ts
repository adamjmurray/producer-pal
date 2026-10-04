// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  lookupMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_FAILURE,
  hookCalls,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { createClip } from "../../create-clip.ts";
import {
  setupDisplacingAudioTrack,
  setupDisplacingTrack,
} from "./create-clip-lane-mocks.ts";

/**
 * How many times Live was asked to make an arrangement clip.
 * @returns The number of create calls the track saw
 */
function createsMade(): number {
  const track = lookupMockObject("track-0") as RegisteredMockObject;

  return track.call.mock.calls.filter(([method]) =>
    String(method).startsWith("create_"),
  ).length;
}

// A later target that goes over an earlier one makes it pointless. The earlier
// one is left unwritten and says so, and the later one reports only what it
// really overwrote.
describe("createClip - a later clip over an earlier one", () => {
  it("writes an arrangement spot named twice once, by the last mention", async () => {
    setupDisplacingTrack([], [{ id: "made", start: 400, end: 404 }]);

    const result = await createClip({
      path: "t0[101|1],t0[101|1]",
      length: "1bar",
    });

    expect(result).toStrictEqual([
      {
        path: "t0[101|1]",
        detail: 'named again as "t0[101|1]" later in this call',
      },
      { id: "made", path: "t0[101|1]" },
    ]);
    expect(createsMade()).toBe(1);
  });

  it("leaves an earlier clip unwritten when a later one covers it whole", async () => {
    setupDisplacingTrack([], [{ id: "made", start: 12, end: 24 }]);

    const result = await createClip({
      path: "t0[5|1],t0[4|1]",
      length: "1bar,3bar",
    });

    // The later entry doesn't name a clip that was never written.
    expect(result).toStrictEqual([
      {
        path: "t0[5|1]",
        detail: "overwritten later in this call by t0[4|1]",
      },
      { id: "made", path: "t0[4|1]" },
    ]);
    expect(createsMade()).toBe(1);
  });

  // The later clip lands across the front of the earlier one, which then
  // starts somewhere else: its entry names it where it sits now.
  it("writes an earlier clip a later one covers the front of, and names what is left", async () => {
    setupDisplacingTrack(
      [],
      [{ id: "made", start: 16, end: 24 }],
      [
        { id: "made", start: 20, end: 24 },
        { id: "made2", start: 12, end: 20 },
      ],
    );

    const result = await createClip({
      path: "t0[5|1],t0[4|1]",
      length: "2bar,2bar",
    });

    expect(result).toStrictEqual([
      {
        id: "made",
        path: "t0[6|1]",
        arrangementLength: "1bar",
        detail: "shortened by t0[4|1] later in this call",
      },
      { id: "made2", path: "t0[4|1]", detail: "shortened the clip at t0[6|1]" },
    ]);
    expect(createsMade()).toBe(2);
  });

  it("says an earlier clip was not written when the later one fails", async () => {
    setupDisplacingTrack([], [{ id: "made", start: 12, end: 24 }]);
    hookCalls(lookupMockObject("track-0") as RegisteredMockObject, /^create_/, {
      before: () => {
        throw new Error(LIVE_FAILURE);
      },
    });

    const result = await createClip({
      path: "t0[5|1],t0[4|1]",
      length: "1bar,3bar",
    });

    // Nothing replaced it, and it was never written either.
    expect(result).toStrictEqual([
      {
        path: "t0[5|1]",
        ok: false,
        detail: "not written: t0[4|1] was meant to replace it, but failed",
      },
      { path: "t0[4|1]", ok: false, detail: LIVE_FAILURE },
    ]);
  });

  // An audio clip is as long as its sample, which Live reads once the clip is
  // made, so nothing says up front what a later clip goes over.
  it("says an audio clip a later one erased is gone, naming the lander", async () => {
    setupDisplacingAudioTrack(
      [],
      [{ id: "made", start: 16, end: 24 }],
      [{ id: "made2", start: 12, end: 24 }],
    );

    const result = (await createClip({
      path: "t0[5|1],t0[4|1]",
      sampleFile: "/samples/a.wav,/samples/b.wav",
    })) as Array<Record<string, unknown>>;

    // The erased clip keeps what the call said of it, but names nothing.
    expect(result).toStrictEqual([
      {
        path: "t0[5|1]",
        length: "2bar",
        warping: true,
        detail: "overwritten later in this call by t0[4|1]",
      },
      {
        id: "made2",
        path: "t0[4|1]",
        length: "3bar",
        warping: true,
        detail: "overwrote the clip at t0[5|1]",
      },
    ]);
  });

  // The tail is cut off, so the clip keeps its id and its path: only its end
  // says a later clip landed across it.
  it("says an audio clip whose tail a later one cut off was shortened", async () => {
    setupDisplacingAudioTrack(
      [],
      [{ id: "made", start: 16, end: 28 }],
      [
        { id: "made", start: 16, end: 24 },
        { id: "made2", start: 24, end: 32 },
      ],
    );

    const result = await createClip({
      path: "t0[5|1],t0[7|1]",
      sampleFile: "/c.wav,/a.wav",
    });

    expect(result).toStrictEqual([
      {
        id: "made",
        path: "t0[5|1]",
        length: "3bar",
        warping: true,
        arrangementLength: "2bar",
        detail: "shortened by t0[7|1] later in this call",
      },
      {
        id: "made2",
        path: "t0[7|1]",
        length: "2bar",
        warping: true,
        detail: "shortened the clip at t0[5|1]",
      },
    ]);
  });

  it("names what is left of an audio clip a later one cut short", async () => {
    setupDisplacingAudioTrack(
      [],
      [{ id: "made", start: 16, end: 24 }],
      [
        { id: "tail", start: 20, end: 24 },
        { id: "made2", start: 12, end: 20 },
      ],
    );

    const result = (await createClip({
      path: "t0[5|1],t0[4|1]",
      sampleFile: "/samples/a.wav,/samples/b.wav",
    })) as Array<Record<string, unknown>>;

    expect(result[0]).toStrictEqual({
      id: "tail",
      path: "t0[6|1]",
      length: "2bar",
      warping: true,
      arrangementLength: "1bar",
      detail: "shortened by t0[4|1] later in this call",
    });
  });
});
