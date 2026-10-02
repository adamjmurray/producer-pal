// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A clip re-created on a take lane exists even when reading it back fails, so
// its entry says what failed instead of reporting the copy as refused.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../../duplicate-mocks-test-helpers.ts";
import {
  lookupMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  duplicateToLanes,
  registerArrangementSource,
  registerLiveSet,
  registerMainLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";

/**
 * Make every clip a lane creates fail to read back.
 * @param track - The destination track, whose new lanes are wrapped
 */
function breakReadBackOnNewLanes(track: RegisteredMockObject): void {
  const createLane = track.methods.create_take_lane as () => unknown[];

  track.methods.create_take_lane = () => {
    const laneRef = createLane();
    const lane = lookupMockObject(
      undefined,
      livePath.track(Number(track.id.at(-1))).takeLane(0),
    ) as RegisteredMockObject;
    const createClip = lane.methods.create_midi_clip as (
      ...args: unknown[]
    ) => unknown[];

    lane.methods.create_midi_clip = (...args: unknown[]) => {
      const clip = createClip(...args);

      const newClip = lookupMockObject(String(clip[1])) as RegisteredMockObject;
      const read = newClip.get.getMockImplementation() as (
        prop: string,
      ) => unknown;

      newClip.get.mockImplementation((prop: string) => {
        if (prop === "is_arrangement_clip") {
          throw new Error("Live went away");
        }

        return read(prop);
      });

      return clip;
    };

    return laneRef;
  };
}

describe("a clip re-created on a take lane that can't be read back", () => {
  it("keeps a clip copy's entry", async () => {
    registerLiveSet();
    registerArrangementSource(true);
    breakReadBackOnNewLanes(registerTakeLaneTrack({ initialLanes: 0 }));

    expect(
      await duplicate({
        type: "clip",
        id: "src_clip",
        arrangementStart: "1|1",
        takeLane: 1,
      }),
    ).toStrictEqual({
      id: expect.any(String),
      detail: expect.stringContaining("couldn't read the copy back: "),
    });
  });

  it("keeps a lane copy's clip entry", async () => {
    registerMainLaneSource([0]);
    breakReadBackOnNewLanes(registerTakeLaneTrack({ trackIndex: 1 }));

    const result = await duplicateToLanes<{ clips: object[] }>({
      id: "src_track",
      toPath: "t1/l0",
    });

    expect(result.clips).toStrictEqual([
      {
        id: expect.any(String),
        detail: expect.stringContaining("couldn't read the copy back: "),
      },
    ]);
  });
});
