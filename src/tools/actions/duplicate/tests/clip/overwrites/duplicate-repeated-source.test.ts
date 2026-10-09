// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A source named twice, apart (A,B,A), is two turns. Copies are made in the
// order named, so the later of two overlapping ones wins whichever source it
// came from, and a copy landing on a later turn's source is refused.

import { afterEach, describe, expect, it, vi } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { setupArrangementSceneMocks } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerLiveLane,
  type LiveLane,
} from "#src/tools/actions/duplicate/tests/clip/overwrites/duplicate-live-lane-test-helpers.ts";

/** The session sources, each as long as every copy the lane makes. */
function registerSources(): void {
  setupArrangementSceneMocks(2);

  for (const [id, scene] of [
    ["clipA", 0],
    ["clipB", 1],
  ] as const) {
    registerMockObject(id, {
      path: livePath.track(0).clipSlot(scene).clip(),
      properties: { is_midi_clip: 1, length: 8 },
    });
  }
}

/**
 * The sources a copy was made from, in the order Live was asked.
 * @param lane - The lane the copies landed on
 * @returns Source id and position per copy
 */
function madeFrom(lane: LiveLane): Array<[unknown, unknown]> {
  return lane.track.call.mock.calls
    .filter(([method]) => method === "duplicate_clip_to_arrangement")
    .map(([, source, beats]) => [source, beats]);
}

type Method = (...args: unknown[]) => unknown;

/**
 * Make one of a lane's arrangement copies throw before it lands.
 * @param lane - The lane
 * @param nth - Which copy made fails, counting from 1
 */
function failCopy(lane: LiveLane, nth: number): void {
  const make = lane.track.methods.duplicate_clip_to_arrangement as Method;
  let made = 0;

  lane.track.methods.duplicate_clip_to_arrangement = (...args) => {
    if (++made === nth) {
      throw new Error("Live is unhappy");
    }

    return make(...args);
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("duplicate - a source named twice, apart", () => {
  // 8-beat copies at beats 0, 4 and 8: each starts inside the one before.
  const OVERLAPPING = "t1[1|1],t1[2|1],t1[3|1]";

  it("makes the copies in the order named, so the last one wins", async () => {
    registerSources();

    const lane = registerLiveLane({ trackIndex: 1 });

    const result = await duplicate({
      type: "clip",
      id: "clipA,clipB,clipA",
      toPath: OVERLAPPING,
    });

    expect(madeFrom(lane)).toStrictEqual([
      ["id clipA", 0],
      ["id clipB", 4],
      ["id clipA", 8],
    ]);
    expect(lane.clips().map(({ start, end }) => [start, end])).toStrictEqual([
      [0, 4],
      [4, 8],
      [8, 16],
    ]);
    expect(result).toStrictEqual([
      {
        id: expect.any(String),
        path: "t1[1|1]",
        detail: "shortened by t1[2|1] later in this call",
      },
      {
        id: expect.any(String),
        path: "t1[2|1]",
        detail: "shortened by t1[3|1] later in this call",
      },
      { id: expect.any(String), path: "t1[3|1]" },
    ]);
  });

  it("still tells a later turn's copy from the same source's own", async () => {
    registerSources();

    const lane = registerLiveLane({ trackIndex: 1 });

    await duplicate({
      type: "clip",
      id: "clipA,clipA,clipB",
      toPath: OVERLAPPING,
    });

    expect(madeFrom(lane)).toStrictEqual([
      ["id clipA", 0],
      ["id clipA", 4],
      ["id clipB", 8],
    ]);
  });

  it("refuses a copy onto a later turn of another source", async () => {
    registerSources();

    const lane = registerLiveLane({ trackIndex: 0 });

    registerLiveLane({ trackIndex: 1 });
    // B sits in the arrangement at beats 16-24, where A's first copy lands.
    registerMockObject("clipB", {
      path: livePath.track(0).arrangementClip(0),
      properties: {
        is_midi_clip: 1,
        is_arrangement_clip: 1,
        start_time: 16,
        end_time: 24,
        length: 8,
      },
    });

    // A's first copy would clear B before B's turn.
    await expect(
      duplicate({
        type: "clip",
        id: "clipA,clipB,clipA",
        toPath: "t0[5|1],t1[1|1],t1[3|1]",
      }),
    ).rejects.toThrow(
      'a copy to "t0[5|1]" would overwrite id "clipB", another source of ' +
        "this call",
    );
    expect(madeFrom(lane)).toStrictEqual([]);
  });

  it("keeps what landed when the last copy fails", async () => {
    registerSources();
    failCopy(registerLiveLane({ trackIndex: 1 }), 3);

    expect(
      await duplicate({
        type: "clip",
        id: "clipA,clipB,clipA",
        toPath: OVERLAPPING,
      }),
    ).toStrictEqual([
      {
        id: "copy-1-0",
        path: "t1[1|1]",
        detail: "shortened by t1[2|1] later in this call",
      },
      { id: "copy-1-1", path: "t1[2|1]" },
      { path: "t1[3|1]", ok: false, detail: "Live is unhappy" },
    ]);
  });

  it("says a copy a failed one was to cut short wasn't", async () => {
    registerSources();
    failCopy(registerLiveLane({ trackIndex: 1 }), 2);

    expect(
      await duplicate({
        type: "clip",
        id: "clipA,clipB,clipA",
        toPath: OVERLAPPING,
      }),
    ).toStrictEqual([
      { id: "copy-1-0", path: "t1[1|1]" },
      { path: "t1[2|1]", ok: false, detail: "Live is unhappy" },
      { id: "copy-1-1", path: "t1[3|1]" },
    ]);
  });

  it("keeps what landed when the deadline stops the call", async () => {
    registerSources();

    const lane = registerLiveLane({ trackIndex: 1 });
    const make = lane.track.methods.duplicate_clip_to_arrangement as Method;
    let now = 0;

    vi.spyOn(Date, "now").mockImplementation(() => now);

    lane.track.methods.duplicate_clip_to_arrangement = (...args) => {
      now += 600;

      return make(...args);
    };

    expect(
      await duplicate(
        { type: "clip", id: "clipA,clipB,clipA", toPath: OVERLAPPING },
        { deadline: 1000 },
      ),
    ).toStrictEqual([
      {
        id: "copy-1-0",
        path: "t1[1|1]",
        detail: "shortened by t1[2|1] later in this call",
      },
      { id: "copy-1-1", path: "t1[2|1]" },
      {
        path: "t1[3|1]",
        ok: false,
        detail: "the request ran out of time; re-run for this destination",
      },
    ]);
  });
});
