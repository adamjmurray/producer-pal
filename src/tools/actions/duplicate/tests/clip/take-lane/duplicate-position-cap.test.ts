// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A position Live won't take refuses the call before any copy or take lane.

import { describe, expect, it, vi } from "vitest";
import "../../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { MAX_ARRANGEMENT_POSITION_BEATS } from "#src/tools/constants.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerMockObject } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

const PAST_CAP = "is past the last position Live allows (394201|1)";

/**
 * A session MIDI clip on track 0, plus the tracks a copy can go to.
 * @param trackIndexes - The tracks to register, source track included
 * @returns The track mocks, by index
 */
function setupClipAndTracks(
  ...trackIndexes: number[]
): ReturnType<typeof registerTrackWithArrangementDup>[] {
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: { is_midi_clip: 1 },
  });

  return trackIndexes.map((index) =>
    registerTrackWithArrangementDup(index, { has_midi_input: 1 }),
  );
}

/**
 * Whether anything was asked of a track.
 * @param track - The track mock
 * @returns True when a call reached it
 */
function touched(track: { call: unknown }): boolean {
  return vi.mocked(track.call as () => void).mock.calls.length > 0;
}

describe("duplicate - positions past the last Live allows", () => {
  it("refuses a clip call before any copy when the last arrangementStart is past it", async () => {
    const tracks = setupClipAndTracks(0, 2);

    await expect(
      duplicate({
        type: "clip",
        id: "clip1",
        toPath: "t0,t2",
        arrangementStart: "5|1,394202|1",
      }),
    ).rejects.toThrow(`arrangementStart ${PAST_CAP}`);

    expect(tracks.some(touched)).toBe(false);
  });

  it("names toPath when the position was written there", async () => {
    const tracks = setupClipAndTracks(0, 2);

    await expect(
      duplicate({ type: "clip", id: "clip1", toPath: "t0[5|1],t2[394202|1]" }),
    ).rejects.toThrow(`toPath ${PAST_CAP}`);

    expect(tracks.some(touched)).toBe(false);
  });

  it("makes no take lane when the position for its destination is past it", async () => {
    setupClipAndTracks(0);

    const lanes = registerTakeLaneTrack({ trackIndex: 2, initialLanes: 0 });

    await expect(
      duplicate({
        type: "clip",
        id: "clip1",
        toPath: "t2/l0[394202|1]",
      }),
    ).rejects.toThrow(`toPath ${PAST_CAP}`);

    expect(lanes.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("still copies to the last position Live takes", async () => {
    const [track] = setupClipAndTracks(0);

    registerArrangementClip(0, 0, MAX_ARRANGEMENT_POSITION_BEATS);

    await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "394201|1",
    });

    expect(track?.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id clip1",
      MAX_ARRANGEMENT_POSITION_BEATS,
    );
  });
});
