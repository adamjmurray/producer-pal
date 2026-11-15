// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  registerDuplicatedTrackSlots,
  registerMockObject,
  registerPendingMockObject,
  type RegisteredMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

/**
 * Register a source track and its copy, whose take lanes hold the given clips.
 * @param laneClipIds - One list of clip ids per take lane on the copy
 * @returns The copy, whose clips a test can add to
 */
function registerCopyWithLaneClips(
  laneClipIds: string[][],
): RegisteredMockObject {
  registerMockObject("track1", { path: livePath.track(0) });
  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  const { newTrack } = registerDuplicatedTrackSlots([]);
  const laneIds = laneClipIds.map((_, lane) => `lane${lane}`);

  newTrack.properties.take_lanes = children(...laneIds);

  for (const [lane, clipIds] of laneClipIds.entries()) {
    const lanePath = `${livePath.track(1)} take_lanes ${lane}`;

    registerPendingMockObject(laneIds[lane] as string, {
      path: lanePath,
      properties: { arrangement_clips: children(...clipIds) },
    });

    for (const [index, clipId] of clipIds.entries()) {
      registerPendingMockObject(clipId, {
        path: `${lanePath} arrangement_clips ${index}`,
        properties: { is_arrangement_clip: 1, start_time: index * 4 },
      });
    }
  }

  return newTrack;
}

// Live copies a track's take lanes with it, and nothing in the API deletes a
// take-lane clip.
describe("duplicate - a track copy withoutClips and its take-lane clips", () => {
  it("lists the take-lane clip it couldn't clear and says so", async () => {
    registerCopyWithLaneClips([["laneClip0"]]);

    const result = await duplicate({
      type: "track",
      id: "track1",
      withoutClips: true,
    });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1",
      path: "t1",
      clips: [{ id: "laneClip0", path: "t1/l0[1|1]" }],
      detail:
        "the track was made, but its 1 take-lane clip is still there: Live only deletes those by hand",
    });
  });

  it("counts the clips on every lane", async () => {
    registerCopyWithLaneClips([["laneClip0", "laneClip1"], [], ["laneClip2"]]);

    const result = await duplicate({
      type: "track",
      id: "track1",
      withoutClips: true,
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        clips: [
          { id: "laneClip0", path: "t1/l0[1|1]" },
          { id: "laneClip1", path: "t1/l0[2|1]" },
          { id: "laneClip2", path: "t1/l2[1|1]" },
        ],
        detail:
          "the track was made, but its 3 take-lane clips are still there: Live only deletes those by hand",
      }),
    );
  });

  it("says nothing when the lanes are empty", async () => {
    registerCopyWithLaneClips([[]]);

    const result = await duplicate({
      type: "track",
      id: "track1",
      withoutClips: true,
    });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1",
      path: "t1",
      clips: [],
    });
  });
});

describe("duplicate - a plain track copy and its take-lane clips", () => {
  it("lists them in clips, with no detail, since nothing was left behind", async () => {
    registerCopyWithLaneClips([["laneClip0"], ["laneClip1"]]);

    const result = await duplicate({ type: "track", id: "track1" });

    expect(result).toStrictEqual({
      id: "live_set/tracks/1",
      path: "t1",
      clips: [
        { id: "laneClip0", path: "t1/l0[1|1]" },
        { id: "laneClip1", path: "t1/l1[1|1]" },
      ],
    });
  });

  it("lists them after the track's session and arrangement clips", async () => {
    const copy = registerCopyWithLaneClips([["laneClip0"]]);

    registerPendingMockObject("mainClip", {
      path: `${livePath.track(1)} arrangement_clips 0`,
      properties: { is_arrangement_clip: 1, start_time: 8 },
    });
    copy.properties.arrangement_clips = children("mainClip");

    const result = (await duplicate({ type: "track", id: "track1" })) as {
      clips: { id: string }[];
    };

    expect(result.clips.map(({ id }) => id)).toStrictEqual([
      "mainClip",
      "laneClip0",
    ]);
  });
});
