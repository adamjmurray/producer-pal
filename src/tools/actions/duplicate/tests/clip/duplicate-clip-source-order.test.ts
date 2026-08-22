// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
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
/** An 8-bar source at bar 9, long enough to reach a copy made four bars ahead. */
const LONG_SOURCE_AT_BAR_9 = { start: 32, end: 64 } as const;

/** Where each copy landed, in the order the copies were actually made. */
let opOrder: string[] = [];

beforeEach(() => {
  opOrder = [];
});

/**
 * A MIDI track that records every copy landing on it: Live's arrangement
 * duplicate for a main-lane copy, `create_midi_clip` for a re-created one.
 * @param trackIndex - Track index
 * @param laneCount - Take lanes to give the track, each recording too
 * @returns The registered track mock
 */
function registerRecordingTrack(
  trackIndex: number,
  laneCount = 0,
): RegisteredMockObject {
  registerArrangementClip(trackIndex, 0, 4);

  const laneIds = Array.from({ length: laneCount }, (_, laneIndex) =>
    registerRecordingLane(trackIndex, laneIndex),
  );

  return registerMockObject(`live_set/tracks/${trackIndex}`, {
    path: livePath.track(trackIndex),
    properties: { has_midi_input: 1, take_lanes: children(...laneIds) },
    methods: {
      duplicate_clip_to_arrangement: () => {
        opOrder.push(`t${trackIndex}`);

        return ["id", livePath.track(trackIndex).arrangementClip(0)];
      },
      create_midi_clip: () => {
        opOrder.push(`t${trackIndex}`);

        return ["id", livePath.track(trackIndex).arrangementClip(0)];
      },
    },
  });
}

/**
 * A take lane that records the copy re-created on it.
 * @param trackIndex - Track holding the lane
 * @param laneIndex - 0-based lane index
 * @returns The lane's mock id
 */
function registerRecordingLane(trackIndex: number, laneIndex: number): string {
  const label = `t${trackIndex}/l${laneIndex}`;
  const clipPath = livePath
    .track(trackIndex)
    .takeLane(laneIndex)
    .arrangementClip(0);

  registerMockObject(clipPath, {
    path: clipPath,
    properties: { is_arrangement_clip: 1, start_time: 4 },
  });

  registerMockObject(label, {
    path: livePath.track(trackIndex).takeLane(laneIndex),
    type: "TakeLane",
    methods: {
      create_midi_clip: () => {
        opOrder.push(label);

        return ["id", clipPath];
      },
    },
  });

  return label;
}

/**
 * Register the source clip and the tracks a fan-out will copy to.
 * @param isArrangementClip - Whether the source sits in the arrangement
 * @param span - Where the source sits on the timeline, in beats
 * @param sourceLane - Take lane the source lives on, or null for the main lane
 */
function setupSource(
  isArrangementClip: boolean,
  span: { start: number; end: number } = SOURCE_AT_BAR_1,
  sourceLane: number | null = null,
): void {
  registerMockObject("live_set", { path: livePath.liveSet });
  registerMockObject("clip1", {
    // A slot path for a session source, so trackIndex is 0 either way.
    path: sourcePath(isArrangementClip, sourceLane),
    properties: {
      is_midi_clip: 1,
      is_arrangement_clip: isArrangementClip ? 1 : 0,
      start_time: span.start,
      end_time: span.end,
      length: span.end - span.start,
    },
  });
  registerRecordingTrack(0, 1);
  registerRecordingTrack(1, 1);
}

/**
 * Where the source clip sits.
 * @param isArrangementClip - Whether the source sits in the arrangement
 * @param sourceLane - Take lane the source lives on, or null for the main lane
 * @returns The clip's Live path
 */
function sourcePath(
  isArrangementClip: boolean,
  sourceLane: number | null,
): PathLike {
  if (!isArrangementClip) return livePath.track(0).clipSlot(0).clip();

  return sourceLane == null
    ? livePath.track(0).arrangementClip(9)
    : livePath.track(0).takeLane(sourceLane).arrangementClip(9);
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

    expect(opOrder).toStrictEqual(["t1", "t0"]);
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

    expect(opOrder).toStrictEqual(["t0", "t1"]);
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

    expect(opOrder).toStrictEqual(["t0", "t1"]);
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

    expect(opOrder).toStrictEqual(["t1", "t0"]);
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

  it("copies to a take lane before overwriting the main-lane source", async () => {
    // A lane is written on its own, so a lane copy can't touch a main-lane
    // source however much of its span it covers. Deferred behind the main-lane
    // copy that does truncate the source, it was re-created from the leftover.
    setupSource(true);

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0,t0/l0",
      arrangementStart: TARGET,
    });

    expect(opOrder).toStrictEqual(["t0/l0", "t0"]);
  });

  it("still defers a copy landing on the source's own lane", async () => {
    // The other half of the same rule: same track and same lane is exactly when
    // a lane copy is in the way, and it still goes last.
    setupSource(true, SOURCE_AT_BAR_1, 0);

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0/l0,t1",
      arrangementStart: TARGET,
    });

    expect(opOrder).toStrictEqual(["t1", "t0/l0"]);
  });

  it("orders a take-lane source by its own length, not arrangementLength", async () => {
    // Every copy of a take-lane source is re-created, and a re-created copy is
    // always the source's length — arrangementLength is ignored (with a
    // warning). Ordering by it put a copy that really does reach the source
    // into the safe bucket, ahead of the copy that then read the leftover.
    setupSource(true, LONG_SOURCE_AT_BAR_9, 0);

    await duplicate({
      type: "clip",
      id: "clip1",
      toPath: "t0/l0,t1",
      arrangementStart: "5|1",
      arrangementLength: "1bar",
    });

    expect(opOrder).toStrictEqual(["t1", "t0/l0"]);
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

    expect(opOrder).toStrictEqual(["t0", "t1"]);
  });
});
