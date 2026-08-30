// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { MAX_TAKE_LANES } from "#src/tools/shared/arrangement/helpers/take-lane-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

// Capture the deadline warning, which shares the outlet with the take-lane ones
vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";

const NOTE = {
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
};

/** What the clock reports. Copying is what moves it, so a stop is deterministic. */
let now = 0;

/**
 * Register the live set and a MIDI source on track 0's main lane.
 * @param copyCostMs - How much clock time one copy's note read burns
 */
function registerSource(copyCostMs: number): void {
  registerMockObject("live-set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
  registerMockObject("src_clip", {
    path: livePath.track(0).arrangementClip(0),
    type: "Clip",
    properties: {
      is_midi_clip: 1,
      is_arrangement_clip: 1,
      length: 4,
      start_time: 0,
      loop_start: 0,
      loop_end: 4,
      start_marker: 0,
      end_marker: 4,
      looping: 1,
      signature_numerator: 4,
      signature_denominator: 4,
    },
    methods: {
      get_notes_extended: () => {
        now += copyCostMs;

        return JSON.stringify({ notes: [NOTE] });
      },
    },
  });
}

/** The warning naming what a deadline stop didn't reach. */
function unreachedWarning(): string | undefined {
  return vi
    .mocked(consoleMock.warn)
    .mock.calls.map(([message]) => String(message))
    .find((message) => message.includes("Not duplicated"));
}

describe("duplicate to a take lane, cut short", () => {
  beforeEach(() => {
    now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  it("names the lane it created, not the l+ that made it", async () => {
    // Re-running "l+" appends a second lane instead of filling this one, and
    // lanes are permanent — so the advice has to name the lane that now exists.
    registerSource(2000);
    registerTakeLaneTrack({ trackIndex: 1, initialLanes: 0 });

    const result = await duplicate(
      {
        type: "clip",
        id: "src_clip",
        toPath: "t1/l+",
        arrangementStart: "1|1,5|1",
      },
      { deadline: 1000 },
    );

    // The one copy that fit landed on the lane the warning goes on to name.
    expect(result).toStrictEqual({
      id: "tl_clip_1",
      path: "t1/l0",
      arrangementStart: "1|1",
    });
    expect(unreachedWarning()).toBe(
      "Ran out of time after duplicating 1 of 2. " +
        "Not duplicated: t1/l0 5|1. Re-run for those positions.",
    );
  });

  it("names a destination it skipped as well as one it never reached", async () => {
    // A destination can be skipped without a copy — here the lane limit. The
    // tally has to match what exists, or the caller reads a copy it never got,
    // and a skipped one has to be named too or it is in neither half of the
    // report: not among the copies that landed, not among the ones still ahead.
    registerSource(2000);
    registerTakeLaneTrack({ trackIndex: 1, initialLanes: MAX_TAKE_LANES });

    const result = await duplicate(
      {
        type: "clip",
        id: "src_clip",
        toPath: "t1/l+,t1/l0,t1/l1",
        arrangementStart: "1|1,5|1,9|1",
      },
      { deadline: 1000 },
    );

    // One copy for three destinations: the first was refused, the third never
    // reached, and both are named. A lone result comes back unwrapped.
    expect(result).toStrictEqual({
      id: "tl_clip_10",
      path: "t1/l0",
      arrangementStart: "5|1",
    });
    expect(unreachedWarning()).toBe(
      "Ran out of time after duplicating 1 of 3. " +
        "Not duplicated: t1/l+ 1|1, t1/l1 9|1. Re-run for those positions.",
    );
  });

  it("creates no lane at all when the budget is already gone", async () => {
    // A lane can't be deleted, so making one and then placing nothing on it
    // leaves permanent debris the caller has to clean up in Live by hand.
    registerSource(0);

    const track = registerTakeLaneTrack({ trackIndex: 1, initialLanes: 0 });

    now = 2000;

    const result = await duplicate(
      {
        type: "clip",
        id: "src_clip",
        toPath: "t1/l+,t1/l1",
        arrangementStart: "1|1",
      },
      { deadline: 1000 },
    );

    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
    expect(result).toStrictEqual([]);
    // Nothing was created, so here "l+" is still what a re-run should send.
    expect(unreachedWarning()).toBe(
      "Ran out of time after duplicating 0 of 2. " +
        "Not duplicated: t1/l+ 1|1, t1/l1 1|1. Re-run for those positions.",
    );
  });
});
