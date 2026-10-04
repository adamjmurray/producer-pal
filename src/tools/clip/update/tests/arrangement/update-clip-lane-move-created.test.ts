// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Take lanes can't be deleted, so a move onto a lane past the last one says
// which lanes it made on the way, even when the move itself is refused.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  MOVABLE_CLIP_ID,
  registerMovableClip,
} from "./movable-clip-test-helpers.ts";
import { registerLiveSet } from "../batch/stacking-track-test-helpers.ts";

const DEST_TRACK = 5;

/**
 * A clip on t0 to move, and a destination track with some lanes.
 * @param initialLanes - Take lanes the destination already has
 * @param clipCreationFails - Whether Live makes no clip on the new lane
 */
function registerWorld(initialLanes: number, clipCreationFails = false): void {
  registerMovableClip(0);
  registerTakeLaneTrack({
    trackIndex: DEST_TRACK,
    initialLanes,
    clipCreationFails,
  });
}

describe("updateClip - take lanes made by a move", () => {
  it("names every lane a move past the end made", async () => {
    registerWorld(0);

    const result = (await updateClip({
      id: MOVABLE_CLIP_ID,
      toPath: `t${DEST_TRACK}/l2[9|1]`,
    })) as { path?: string; created?: string };

    expect(result.path).toBe(`t${DEST_TRACK}/l2[9|1]`);
    expect(result.created).toBe("l0-l2");
  });

  it("names only the lanes past the ones the track had", async () => {
    registerWorld(1);

    const result = (await updateClip({
      id: MOVABLE_CLIP_ID,
      toPath: `t${DEST_TRACK}/l2[9|1]`,
    })) as { created?: string };

    expect(result.created).toBe("l1-l2");
  });

  it("says nothing for a lane that was already there", async () => {
    registerWorld(2);

    const result = (await updateClip({
      id: MOVABLE_CLIP_ID,
      toPath: `t${DEST_TRACK}/l1[9|1]`,
    })) as object;

    expect(result).not.toHaveProperty("created");
  });

  it("keeps the lanes on the entry when the move is then refused", async () => {
    registerWorld(0, true);

    const result = (await updateClip({
      id: MOVABLE_CLIP_ID,
      toPath: `t${DEST_TRACK}/l1[9|1]`,
    })) as { created?: string; detail?: string; ok?: boolean };

    expect(result.created).toBe("l0-l1");
    expect(result.detail).toContain("not moved");
    // The entry still names the clip's own track, so the lanes name theirs.
    expect(result.detail).toContain(`take lanes l0-l1 made on t${DEST_TRACK}`);
    // The lanes exist now, so this is no skip.
    expect(result.ok).toBeUndefined();
  });
});

// A take-lane move whose re-create fails after Live made the clip still went
// over whatever sat at the destination, so what it says names that too.

/**
 * The id of a clip on take lane 0 of track 0.
 * @param index - Its place on the lane
 * @returns The id
 */
function laneClipId(index: number): string {
  return lookupMockObject(
    undefined,
    livePath.track(0).takeLane(0).arrangementClip(index),
  )?.id as string;
}

describe("updateClip - a partial re-create over a clip", () => {
  it("names what it went over, and keeps the source", async () => {
    registerLiveSet();
    registerTakeLaneTrack({
      initialLanes: 1,
      initialLaneClips: [
        [
          { start: 0, end: 4 },
          { start: 16, end: 20 },
        ],
      ],
      postCreateFails: true,
    });

    const moved = laneClipId(0);
    // Only a clip with notes writes them, which is where the re-create fails.
    const source = lookupMockObject(moved);

    registerMockObject(moved, {
      type: "Clip",
      properties: source?.properties,
      methods: {
        get_notes_extended: () =>
          JSON.stringify({
            notes: [{ pitch: 60, start_time: 0, duration: 1, velocity: 100 }],
          }),
      },
    });

    // A lone target that did no update fails the call, with the detail as its
    // message.
    await expect(
      updateClip({ id: moved, toPath: "t0/l0[5|1]" }),
    ).rejects.toThrow(
      "not moved: an incomplete clip was left on t0/l0 (notes failed); the original clip was kept; overwrote the clip at t0/l0[5|1]",
    );
  });
});
