// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Clearing a range and finding the holding area ask the call's lane view what
// is on the lane, so they read the clips a range touches and no others, however
// many times the call asks.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  registerStackingTrack,
  stackedLaneSpans,
} from "#src/tools/clip/update/tests/batch/stacking-track-test-helpers.ts";
import {
  clearArrangementRange,
  holdingAreaStartOnTrack,
} from "../arrangement-tiling-workaround.ts";
import { LaneView } from "../helpers/arrangement-lane-view.ts";
import { mockContext } from "./helpers/arrangement-tiling-test-helpers.ts";

/** Clips on the track, each 4 beats long, one every 8 beats from beat 0. */
const LANE = 30;

/**
 * @param ids - Clip ids
 * @returns How often each one's properties were read, in order
 */
function readsOf(ids: string[]): number[] {
  return ids.map((id) => lookupMockObject(id)?.get.mock.calls.length ?? 0);
}

describe("a lane the call shares", () => {
  let ids: string[];
  let track: LiveAPI;
  const context = (): typeof mockContext & { lanes: LaneView } => ({
    ...mockContext,
    lanes: new LaneView(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ids = registerStackingTrack(Array.from({ length: LANE }, () => 4));
    track = LiveAPI.from("live_set tracks 0");
  });

  /**
   * @returns The temp clips made on the track so far
   */
  function tempClipsMade(): number {
    return (
      lookupMockObject("stacking-track")?.call.mock.calls.filter(
        ([name]) => name === "create_midi_clip",
      ).length ?? 0
    );
  }

  it("clears three ranges without reading a clip none of them touch more than once", () => {
    const shared = context();
    const from = vi.spyOn(LiveAPI, "from");

    clearArrangementRange(track, 0, 6, true, shared);
    clearArrangementRange(track, 16, 20, true, shared);
    clearArrangementRange(track, 32, 36, true, shared);

    // Clips at 0, 16 and 32 are gone; the clip at 8 is untouched.
    expect(stackedLaneSpans().slice(0, 3)).toStrictEqual([
      [8, 12],
      [24, 28],
      [40, 44],
    ]);

    const untouched = ids.slice(10);

    expect(readsOf(untouched)).toStrictEqual(untouched.map(() => 2));
    expect(
      untouched.map(
        (id) =>
          from.mock.calls.filter(([found]) => found === `id ${id}`).length,
      ),
    ).toStrictEqual(untouched.map(() => 1));
  });

  it("knows a clip it trimmed is shorter, so clearing the part it lost does nothing", () => {
    const shared = context();

    // Clip 1 is [0, 4]: this cuts its tail off.
    clearArrangementRange(track, 2, 6, true, shared);

    expect(stackedLaneSpans()[0]).toStrictEqual([0, 2]);
    expect(tempClipsMade()).toBe(1);

    clearArrangementRange(track, 3, 5, true, shared);

    expect(tempClipsMade()).toBe(1);
  });

  it("reads the lane fresh for a context nobody made a view for, so it is right about what changed", () => {
    // Slower, never wrong: every ask is its own scan.
    clearArrangementRange(track, 2, 6, true, mockContext);
    clearArrangementRange(track, 3, 5, true, mockContext);

    expect(tempClipsMade()).toBe(1);
  });

  it("finds the holding area from the lane's last end, and sees a clip made past it", () => {
    const shared = context();
    const lastEnd = (LANE - 1) * 8 + 4;

    expect(holdingAreaStartOnTrack(track, 0, shared)).toBe(lastEnd + 100);
    expect(holdingAreaStartOnTrack(track, lastEnd + 500, shared)).toBe(
      lastEnd + 600,
    );

    // A clip written past the end by anything in the call.
    track.call("create_midi_clip", 400, 8);

    expect(holdingAreaStartOnTrack(track, 0, shared)).toBe(508);
  });

  it("asks for the holding area again without reading a clip again", () => {
    const shared = context();

    holdingAreaStartOnTrack(track, 0, shared);

    const before = readsOf(ids);

    holdingAreaStartOnTrack(track, 0, shared);
    holdingAreaStartOnTrack(track, 0, shared);

    expect(readsOf(ids)).toStrictEqual(before);
  });
});
