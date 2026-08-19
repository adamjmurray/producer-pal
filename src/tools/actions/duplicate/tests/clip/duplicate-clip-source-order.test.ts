// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerMockObject,
  type RegisteredMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { registerArrangementClip } from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";

/** A 4-bar source clip at bar 1 on track 0. */
const SOURCE_END = 16;
const SOURCE_AT_BAR_1 = { start: 0, end: SOURCE_END } as const;
/** Where the copies go: bar 2, four beats into the source's own span. */
const TARGET = "2|1";
/** A 4-bar source at bar 9, so a copy at bar 1 lands entirely before it. */
const SOURCE_AT_BAR_9 = { start: 32, end: 48 } as const;

/** Track index per duplicate call, in the order the calls happened. */
let dupOrder: number[] = [];

beforeEach(() => {
  dupOrder = [];
});

/**
 * A MIDI track whose arrangement duplicate records that it ran.
 * @param trackIndex - Track index
 * @returns The registered track mock
 */
function registerRecordingTrack(trackIndex: number): RegisteredMockObject {
  registerArrangementClip(trackIndex, 0, 4);

  return registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: livePath.track(trackIndex),
    properties: { has_midi_input: 1 },
    methods: {
      duplicate_clip_to_arrangement: () => {
        dupOrder.push(trackIndex);

        return ["id", livePath.track(trackIndex).arrangementClip(0)];
      },
    },
  });
}

/**
 * Register the source clip and the tracks a fan-out will copy to.
 * @param isArrangementClip - Whether the source sits in the arrangement
 * @param span - Where the source sits on the timeline, in beats
 */
function setupSource(
  isArrangementClip: boolean,
  span: { start: number; end: number } = SOURCE_AT_BAR_1,
): void {
  registerMockObject("live_set", { path: livePath.liveSet });
  registerMockObject("clip1", {
    // A slot path for a session source, so trackIndex is 0 either way.
    path: isArrangementClip
      ? livePath.track(0).arrangementClip(9)
      : livePath.track(0).clipSlot(0).clip(),
    properties: {
      is_midi_clip: 1,
      is_arrangement_clip: isArrangementClip ? 1 : 0,
      start_time: span.start,
      end_time: span.end,
    },
  });
  registerRecordingTrack(0);
  registerRecordingTrack(1);
}

describe("duplicate clip fan-out order", () => {
  it("copies to the other track before overwriting the source", async () => {
    // Landing on the source's own span trims it, so doing t0 first would leave
    // t1 with a copy of the 1-bar leftover. Reversing toPath used to be the
    // only way to get two full copies.
    setupSource(true);

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0,t1",
      arrangementStart: TARGET,
    });

    expect(dupOrder).toStrictEqual([1, 0]);
  });

  it("still reports the copies in the order they were asked for", async () => {
    setupSource(true);

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0,t1",
      arrangementStart: TARGET,
    });

    expect(result).toStrictEqual([
      {
        id: livePath.track(0).arrangementClip(0),
        path: "t0",
        arrangementStart: TARGET,
      },
      {
        id: livePath.track(1).arrangementClip(0),
        path: "t1",
        arrangementStart: TARGET,
      },
    ]);
  });

  it("leaves the order alone for a destination past the source's end", async () => {
    // Everything clears forward from where it starts, so a copy landing at or
    // after the source's end can't reach it — no reason to move it.
    setupSource(true);

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0,t1",
      arrangementStart: "5|1",
    });

    expect(dupOrder).toStrictEqual([0, 1]);
  });

  it("leaves the order alone for a copy that stops short of the source", async () => {
    // Regression: "starts before the source ends" also caught a copy that never
    // reaches it. Deferred behind the copy that does truncate the source, it was
    // then made from the leftover — half length, decided by nothing but the
    // order the positions were listed in.
    setupSource(true, SOURCE_AT_BAR_9);

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0,t1",
      arrangementStart: "1|1",
    });

    expect(dupOrder).toStrictEqual([0, 1]);
  });

  it("defers a copy whose arrangementLength tiles into the source", async () => {
    // Same start, but 16 bars of tiling reaches the source at bar 9, so this
    // copy does have to go last.
    setupSource(true, SOURCE_AT_BAR_9);

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0,t1",
      arrangementStart: "1|1",
      arrangementLength: "16bar",
    });

    expect(dupOrder).toStrictEqual([1, 0]);
  });

  it("still rejects an arrangementLength it can't parse", async () => {
    // Ordering asks how far a copy reaches, so it parses the length too — but
    // it must not be the one to decide a bad one, or a lane copy that ignores
    // the param would start failing.
    setupSource(true, SOURCE_AT_BAR_9);

    await expect(
      duplicate({
        type: "clip",
        id: "clip1",
        toPath: "t0",
        arrangementStart: "1|1",
        arrangementLength: "abc",
      }),
    ).rejects.toThrow("Invalid duration format");
  });

  it("leaves the order alone for a session source", async () => {
    // A session clip isn't on the arrangement timeline the copies clear, so no
    // destination can overwrite it.
    setupSource(false);

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0,t1",
      arrangementStart: TARGET,
    });

    expect(dupOrder).toStrictEqual([0, 1]);
  });
});
