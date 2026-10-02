// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ArrangementLane } from "#src/tools/shared/validation/helpers/object-path-position.ts";
import {
  arrangementLaneOf,
  arrangementWriteEffects,
  snapshotLane,
} from "../arrangement-write-effects.ts";

const MAIN_LANE: ArrangementLane = { kind: "track", trackIndex: 0 };
const TAKE_LANE: ArrangementLane = {
  kind: "take-lane",
  trackIndex: 0,
  laneIndex: 1,
};

/** One clip on a lane, as the registry should answer for it. */
interface Span {
  id: string;
  start: number;
  end: number;
}

/**
 * Put these clips on the track's main lane, replacing whatever was there.
 * @param spans - The clips, in Live's order
 */
function setMainLane(spans: Span[]): void {
  setLane(spans, (index) => livePath.track(0).arrangementClip(index));
  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children(...spans.map((s) => s.id)) },
  });
}

/**
 * Put these clips on take lane 1, replacing whatever was there.
 * @param spans - The clips, in Live's order
 */
function setTakeLane(spans: Span[]): void {
  setLane(spans, (index) =>
    livePath.track(0).takeLane(1).arrangementClip(index),
  );
  registerMockObject("lane_1", {
    path: livePath.track(0).takeLane(1),
    properties: { arrangement_clips: children(...spans.map((s) => s.id)) },
  });
  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children() },
  });
}

/**
 * Register each clip at the path its index gives it.
 * @param spans - The clips, in Live's order
 * @param pathAt - The path a clip at that index sits on
 */
function setLane(spans: Span[], pathAt: (index: number) => PathLike): void {
  for (const [index, { id, start, end }] of spans.entries()) {
    registerMockObject(id, {
      path: pathAt(index),
      type: "Clip",
      properties: { start_time: start, end_time: end },
    });
  }
}

/**
 * Photograph the main lane, rewrite it, and report what the write did.
 * @param before - The clips on the lane to start with
 * @param after - The clips on it once the write has run
 * @param written - Ids the write itself created or moved
 * @returns What the write did to the clips that were already there
 */
function effectsOfWrite(
  before: Span[],
  after: Span[],
  written: string[] = [],
): string | undefined {
  setMainLane(before);

  const snapshot = snapshotLane(MAIN_LANE);

  setMainLane(after);

  return arrangementWriteEffects(snapshot, written);
}

describe("arrangementLaneOf", () => {
  it("names the main lane for a destination with no take lane", () => {
    expect(arrangementLaneOf({ trackIndex: 2, takeLane: null })).toStrictEqual({
      kind: "track",
      trackIndex: 2,
    });
  });

  it("names the take lane a destination landed on", () => {
    expect(arrangementLaneOf({ trackIndex: 2, takeLane: 1 })).toStrictEqual({
      kind: "take-lane",
      trackIndex: 2,
      laneIndex: 1,
    });
  });
});

describe("arrangementWriteEffects", () => {
  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
  });

  it("says nothing when the write left the neighbours alone", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 0, end: 8 }],
        [
          { id: "a", start: 0, end: 8 },
          { id: "new", start: 16, end: 24 },
        ],
        ["new"],
      ),
    ).toBeUndefined();
  });

  it("names a clip the write wiped out, at the address it had", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 12, end: 20 }],
        [{ id: "new", start: 12, end: 24 }],
        ["new"],
      ),
    ).toBe("overwrote the clip at t0[4|1]");
  });

  it("names a clip the write cut short, where it sits now", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 0, end: 20 }],
        [
          { id: "a", start: 0, end: 12 },
          { id: "new", start: 12, end: 24 },
        ],
        ["new"],
      ),
    ).toBe("shortened the clip at t0[1|1]");
  });

  // A front trim moves the clip's start, so the address it answers to changes.
  it("names a front-trimmed clip at its new address", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 8, end: 24 }],
        [
          { id: "new", start: 0, end: 16 },
          { id: "a", start: 16, end: 24 },
        ],
        ["new"],
      ),
    ).toBe("shortened the clip at t0[5|1]");
  });

  // Live re-creates what a front trim leaves under a new id, so the old id
  // vanishing doesn't mean the clip is gone.
  it("names a front-trimmed clip Live gave a new id as shortened", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 8, end: 24 }],
        [
          { id: "new", start: 0, end: 16 },
          { id: "rest", start: 16, end: 24 },
        ],
        ["new"],
      ),
    ).toBe("shortened the clip at t0[5|1]");
  });

  // A new clip inside the old span that stops short of its end isn't the rest.
  it("still says overwrote when no new clip ends where the old one did", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 8, end: 24 }],
        [
          { id: "new", start: 0, end: 18 },
          { id: "s", start: 18, end: 22 },
        ],
        ["new"],
      ),
    ).toBe("overwrote the clip at t0[3|1]");
  });

  // Live keeps the head on the original id and gives the tail a new one, so
  // the new clip inside the old span is what says a split happened.
  it("names both pieces of a clip the write split", () => {
    expect(
      effectsOfWrite(
        [{ id: "a", start: 0, end: 32 }],
        [
          { id: "a", start: 0, end: 12 },
          { id: "new", start: 12, end: 16 },
          { id: "tail", start: 16, end: 32 },
        ],
        ["new"],
      ),
    ).toBe("split the clip at t0[1|1] into t0[1|1] and t0[5|1]");
  });

  it("joins what it did to several clips", () => {
    expect(
      effectsOfWrite(
        [
          { id: "a", start: 0, end: 16 },
          { id: "b", start: 16, end: 24 },
        ],
        [
          { id: "a", start: 0, end: 8 },
          { id: "new", start: 8, end: 32 },
        ],
        ["new"],
      ),
    ).toBe("shortened the clip at t0[1|1]; overwrote the clip at t0[5|1]");
  });

  // A move's own source sits on the lane and is cleared right after, so it
  // must not report on itself.
  it("says nothing about the clips the write itself accounts for", () => {
    expect(
      effectsOfWrite(
        [{ id: "source", start: 0, end: 16 }],
        [{ id: "moved", start: 32, end: 48 }],
        ["source", "moved"],
      ),
    ).toBeUndefined();
  });

  it("reads a take lane rather than the track's own clips", () => {
    setTakeLane([{ id: "a", start: 16, end: 24 }]);

    const snapshot = snapshotLane(TAKE_LANE);

    setTakeLane([{ id: "new", start: 16, end: 32 }]);

    expect(arrangementWriteEffects(snapshot, ["new"])).toBe(
      "overwrote the clip at t0/l1[5|1]",
    );
  });
});
