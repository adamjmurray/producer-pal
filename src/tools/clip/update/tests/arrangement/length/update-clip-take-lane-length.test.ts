// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A take-lane clip resizes in place. A take lane can't be cleared, so a lengthen
// stops at the next clip on the lane and the clip's entry says so.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  type RegisteredMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { resizesLikeLiveClip } from "#src/test/mocks/registry/mock-clip-resize.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { registerLiveSet } from "../../batch/stacking-track-test-helpers.ts";

/**
 * Track 0 with one take lane holding clips at the given spans, each resizing
 * the way Live does.
 * @param spans - The lane's clips, in beats
 * @param stopsAt - Where Live stops the first clip growing
 * @returns The clips, in lane order
 */
function laneClips(
  spans: Array<{ start: number; end: number }>,
  stopsAt = spans[1]?.start ?? Infinity,
): RegisteredMockObject[] {
  registerLiveSet();
  registerTakeLaneTrack({ initialLanes: 1, initialLaneClips: [spans] });

  const clips = spans.map(
    (_, index) =>
      lookupMockObject(
        undefined,
        livePath.track(0).takeLane(0).arrangementClip(index),
      ) as RegisteredMockObject,
  );

  resizesLikeLiveClip(clips[0] as RegisteredMockObject, stopsAt);

  return clips;
}

/**
 * Resize the first clip on the lane.
 * @param clip - The clip
 * @param arrangementLength - The length to give it
 * @returns Its entry
 */
async function resize(
  clip: RegisteredMockObject,
  arrangementLength: string,
): Promise<ClipResult> {
  return (await updateClip({ id: clip.id, arrangementLength })) as ClipResult;
}

describe("updateClip - arrangementLength on a take-lane clip", () => {
  it("lengthens the clip in place without laying a temp clip", async () => {
    const [clip] = laneClips([{ start: 0, end: 4 }]) as [RegisteredMockObject];
    const lane = lookupMockObject(
      undefined,
      livePath.track(0).takeLane(0),
    ) as RegisteredMockObject;

    expect(await resize(clip, "3bar")).toStrictEqual({
      id: clip.id,
      path: "t0/l0[1|1]",
    });
    expect(clip.properties.end_time).toBe(12);
    expect(clip.properties.looping).toBe(1);
    expect(lane.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );
  });

  it("stops at the next clip on the lane and says so", async () => {
    const [clip, next] = laneClips([
      { start: 0, end: 4 },
      { start: 8, end: 12 },
    ]) as [RegisteredMockObject, RegisteredMockObject];

    expect(await resize(clip, "4bar")).toStrictEqual({
      id: clip.id,
      path: "t0/l0[1|1]",
      detail:
        "arrangementLength landed at 2bar: the next clip on the lane starts there",
    });
    expect(clip.properties.end_time).toBe(8);
    expect(next.properties.start_time).toBe(8);
  });

  it("says only Live's reason when Live stops it before the next clip", async () => {
    const [clip] = laneClips(
      [
        { start: 0, end: 4 },
        { start: 8, end: 12 },
      ],
      6,
    ) as [RegisteredMockObject];

    const { detail } = await resize(clip, "4bar");

    expect(detail).toMatch(/: Live stopped the clip there$/);
    expect(detail).not.toContain("next clip");
  });

  it("shortens the clip in place", async () => {
    const [clip] = laneClips([{ start: 0, end: 8 }]) as [RegisteredMockObject];

    expect(await resize(clip, "1bar")).toStrictEqual({
      id: clip.id,
      path: "t0/l0[1|1]",
    });
    expect(clip.properties.end_time).toBe(4);
  });
});
