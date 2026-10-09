// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A copy that clears clips and then fails still changed the Set, so its entry
// says what it destroyed and is not a skip.

import { describe, expect, it } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  copySceneTo,
  registerEightBeatSource,
  registerLiveLane,
  registerTwoClipScene,
  type LiveLane,
} from "#src/tools/actions/duplicate/tests/clip/overwrites/duplicate-live-lane-test-helpers.ts";

/**
 * Make a track's next arrangement duplicate clear its range and then throw.
 * @param lane - The track's lane
 */
function clearThenThrow(lane: LiveLane): void {
  const duplicateClip = lane.track.methods.duplicate_clip_to_arrangement as (
    ...args: unknown[]
  ) => unknown;

  lane.declineNextWrite();

  lane.track.methods.duplicate_clip_to_arrangement = (...args: unknown[]) => {
    duplicateClip(...args);

    throw new Error("Live is unhappy");
  };
}

/** A lane with a clip at beats 16-20, which a copy at [5|1] covers. */
function laneWithClip(trackIndex: number): LiveLane {
  return registerLiveLane({
    trackIndex,
    clips: [{ id: `old-${trackIndex}`, start: 16, end: 20 }],
  });
}

describe("a clip copy that clears clips and then throws", () => {
  it("keeps its place, saying what it overwrote, beside a copy that landed", async () => {
    registerEightBeatSource();
    clearThenThrow(laneWithClip(1));
    registerLiveLane({ trackIndex: 0 });

    expect(
      await duplicate({
        type: "clip",
        id: "source",
        toPath: "t1[5|1],t0[9|1]",
      }),
    ).toStrictEqual([
      {
        path: "t1[5|1]",
        detail: "Live is unhappy; overwrote the clip at t1[5|1]",
      },
      { id: "copy-0-0", path: "t0[9|1]" },
    ]);
  });

  it("answers a lone one with the entry, not an error", async () => {
    registerEightBeatSource();
    clearThenThrow(laneWithClip(1));

    expect(
      await duplicate({ type: "clip", id: "source", toPath: "t1[5|1]" }),
    ).toStrictEqual({
      path: "t1[5|1]",
      detail: "Live is unhappy; overwrote the clip at t1[5|1]",
    });
  });

  it("is still a skip when it cleared nothing", async () => {
    registerEightBeatSource();
    clearThenThrow(registerLiveLane({ trackIndex: 1 }));

    await expect(
      duplicate({ type: "clip", id: "source", toPath: "t1[5|1]" }),
    ).rejects.toThrow("Live is unhappy");
  });
});

describe("a scene copy whose track clears clips and then throws", () => {
  it("names what the track cleared, beside a track that landed", async () => {
    registerTwoClipScene();
    clearThenThrow(laneWithClip(0));
    registerLiveLane({ trackIndex: 1 });

    expect(await copySceneTo("[5|1]")).toStrictEqual({
      clips: [{ id: "copy-1-0", path: "t1[5|1]" }],
      detail: "on t0: Live is unhappy, but overwrote the clip at t0[5|1]",
    });
  });

  it("answers a lone position where every track did, not with an error", async () => {
    registerTwoClipScene();
    clearThenThrow(laneWithClip(0));
    clearThenThrow(laneWithClip(1));

    expect(await copySceneTo("[5|1]")).toStrictEqual({
      clips: [],
      detail:
        "on t0: Live is unhappy, but overwrote the clip at t0[5|1]; " +
        "on t1: Live is unhappy, but overwrote the clip at t1[5|1]",
    });
  });
});
