// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A duplicate call shares one view of each lane with everything it hands work
// to — the clears before an arrangement copy, the update-clip call that
// lengthens one — so a long lane is read once, not once per copy. These run the
// real clearing and lengthening against a track that overwrites the way Live
// does.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  expectUntouchedClipsReadOnce,
  makeLooping,
  readsOf,
  registerStackingTrack,
  stackedLaneSpans,
} from "#src/tools/clip/update/tests/batch/stacking-track-test-helpers.ts";

/** Clips on the track, each 4 beats long, one every 8 beats from beat 0. */
const LANE = 40;

/** The clips of the far end of the lane, which no copy here comes near. */
const FAR_FROM = 30;

describe("duplicate over a long lane", () => {
  let ids: string[];

  beforeEach(() => {
    ids = registerStackingTrack(Array.from({ length: LANE }, () => 4));
  });

  it("reads each clip an arrangement clip's copies don't touch once", async () => {
    const from = vi.spyOn(LiveAPI, "from");
    const result = await duplicate({
      type: "clip",
      id: ids[0] as string,
      // Onto the places clips 10 to 17 sit.
      toPath: Array.from({ length: 8 }, (_, i) => `t0[${21 + 2 * i}|1]`).join(
        ",",
      ),
    });

    expect(
      (result as Array<{ path: string; detail: string }>).map(
        ({ path, detail }) => [path, detail],
      ),
    ).toStrictEqual(
      Array.from({ length: 8 }, (_, i) => [
        `t0[${21 + 2 * i}|1]`,
        `overwrote the clip at t0[${21 + 2 * i}|1]`,
      ]),
    );

    const far = ids.slice(FAR_FROM);

    expectUntouchedClipsReadOnce(from, far);
  });

  it("reads each clip lengthened session copies don't touch once", async () => {
    registerMockObject("session", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
      properties: {
        is_midi_clip: 1,
        is_arrangement_clip: 0,
        start_time: 0,
        end_time: 4,
        length: 4,
        looping: 1,
        loop_start: 0,
        loop_end: 4,
        start_marker: 0,
        end_marker: 4,
      },
    });

    const result = await duplicate({
      type: "clip",
      id: "session",
      toPath: Array.from({ length: 6 }, (_, i) => `t0[${21 + 4 * i}|1]`).join(
        ",",
      ),
      arrangementLength: "2bar",
    });

    // Each copy is two clips (the copy and its tile) over the clip it landed on.
    expect(
      (result as Array<{ clips: Array<{ detail?: string }> }>).map(
        ({ clips }) => clips[0]?.detail,
      ),
    ).toStrictEqual(
      Array.from(
        { length: 6 },
        (_, i) => `overwrote the clip at t0[${21 + 4 * i}|1]`,
      ),
    );

    const far = ids.slice(FAR_FROM);

    expect(readsOf(far)).toStrictEqual(far.map(() => 2));
  });

  describe("a copy after another in the same call", () => {
    it("leaves a shorter copy a longer one buries unwritten, and the longer one overwrote what was there", async () => {
      makeLooping(ids[0] as string);

      // A one-bar copy at bar 21, then a four-bar copy at bar 19 whose tiles
      // cover it, then a four-bar copy further on.
      const result = await duplicate({
        type: "clip",
        id: ids[0] as string,
        toPath: "t0[21|1],t0[19|1],t0[41|1]",
        arrangementLength: "1bar,4bar,4bar",
      });

      expect(result).toStrictEqual([
        {
          path: "t0[21|1]",
          detail: "overwritten later in this call by t0[19|1]",
        },
        {
          path: "t0",
          clips: [
            {
              id: expect.any(String),
              path: "t0[19|1]",
              detail:
                "overwrote the clip at t0[19|1]; overwrote the clip at t0[21|1]",
            },
            { id: expect.any(String), path: "t0[20|1]" },
            { id: expect.any(String), path: "t0[21|1]" },
            { id: expect.any(String), path: "t0[22|1]" },
          ],
        },
        {
          path: "t0",
          clips: [
            {
              id: expect.any(String),
              path: "t0[41|1]",
              detail:
                "overwrote the clip at t0[41|1]; overwrote the clip at t0[43|1]",
            },
            { id: expect.any(String), path: "t0[42|1]" },
            { id: expect.any(String), path: "t0[43|1]" },
            { id: expect.any(String), path: "t0[44|1]" },
          ],
        },
      ]);

      // The lane as Live would leave it: the clip at bar 23 (beat 88) survives.
      expect(
        stackedLaneSpans().filter(([start]) => start >= 72 && start < 96),
      ).toStrictEqual([
        [72, 76],
        [76, 80],
        [80, 84],
        [84, 88],
        [88, 92],
      ]);

      const far = ids.slice(FAR_FROM);

      expect(readsOf(far)).toStrictEqual(far.map(() => 2));
    });
  });
});
