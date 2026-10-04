// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Take lanes can't be deleted, so a move onto a lane past the last one says
// which lanes it made on the way, even when the move itself is refused.

import { describe, expect, it } from "vitest";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  MOVABLE_CLIP_ID,
  registerMovableClip,
} from "./movable-clip-test-helpers.ts";

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
