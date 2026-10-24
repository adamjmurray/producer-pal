// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A failure on one track or position of a scene's arrangement copy costs only
// that track or position.

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import {
  copySceneTo,
  registerLiveLane,
  registerTwoClipScene,
  type LiveLane,
} from "#src/tools/actions/duplicate/tests/clip/overwrites/duplicate-live-lane-test-helpers.ts";
import {
  registerClipSlot,
  setupArrangementSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

/**
 * Make a track's duplicate throw from its nth call on.
 * @param lane - The track's lane
 * @param nth - The call (1-based) that first throws
 */
function throwFrom(lane: LiveLane, nth: number): void {
  const duplicateClip = lane.track.methods.duplicate_clip_to_arrangement as (
    ...args: unknown[]
  ) => unknown;
  let calls = 0;

  lane.track.methods.duplicate_clip_to_arrangement = (...args: unknown[]) => {
    if (++calls >= nth) {
      throw new Error("Live is unhappy");
    }

    return duplicateClip(...args);
  };
}

describe("a scene copied to the arrangement when a track throws", () => {
  it("keeps the clips of the tracks that landed, and names the one that threw", async () => {
    registerTwoClipScene();
    throwFrom(registerLiveLane({ trackIndex: 0 }), 1);
    registerLiveLane({ trackIndex: 1 });

    expect(await copySceneTo("[5|1]")).toStrictEqual({
      clips: [{ id: "copy-1-0", path: "t1[5|1]" }],
      detail: "on t0: Live is unhappy",
    });
  });

  it("keeps the earlier position when a later one lands nothing", async () => {
    registerTwoClipScene();
    throwFrom(registerLiveLane({ trackIndex: 0 }), 2);
    throwFrom(registerLiveLane({ trackIndex: 1 }), 2);

    expect(await copySceneTo("[5|1],[9|1]")).toStrictEqual([
      {
        clips: [
          { id: "copy-0-0", path: "t0[5|1]" },
          { id: "copy-1-0", path: "t1[5|1]" },
        ],
      },
      {
        path: "[9|1]",
        ok: false,
        detail:
          "no clip landed: on t0: Live is unhappy; on t1: Live is unhappy",
      },
    ]);
  });

  it("throws when the one position it was asked for landed nothing", async () => {
    registerTwoClipScene();
    throwFrom(registerLiveLane({ trackIndex: 0 }), 1);
    registerLiveLane({
      trackIndex: 1,
    }).track.methods.duplicate_clip_to_arrangement = () => 1;

    await expect(copySceneTo("[5|1]")).rejects.toThrow(
      "no clip landed: on t0: Live is unhappy; Live made no copy on t1",
    );
  });

  it("is not a skip when a declining track still cleared clips", async () => {
    registerTwoClipScene();

    const first = registerLiveLane({
      trackIndex: 0,
      clips: [{ id: "x", start: 16, end: 20 }],
    });

    first.declineNextWrite();
    throwFrom(registerLiveLane({ trackIndex: 1 }), 1);

    expect(await copySceneTo("[5|1]")).toStrictEqual({
      clips: [],
      detail:
        "Live made no copy on t0, but overwrote the clip at t0[5|1]; on t1: Live is unhappy",
    });
  });
});

describe("a scene with nothing to copy to the arrangement", () => {
  it("is a normal entry for every position, never a skip", async () => {
    setupArrangementSceneMocks(2);
    registerClipSlot(0, 0, false);
    registerClipSlot(1, 0, false);

    expect(await copySceneTo("[5|1],[9|1]")).toStrictEqual([
      { clips: [], detail: "the scene has no clips" },
      { clips: [], detail: "the scene has no clips" },
    ]);
  });
});
