// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live 12.3 crashes when a re-create lands strictly inside a clip; a take lane
// can't be cut out of the way, so there the move is refused.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { registerLiveVersion } from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  MOVABLE_CLIP_ID,
  registerMovableClip,
} from "./movable-clip-test-helpers.ts";

const DEST_TRACK = 5;

/**
 * A 2-bar clip on t0, and a take lane on t5 holding one clip from bar 1 to 17.
 * @param version - The running Live
 * @returns The destination lane's mock
 */
function registerWorld(version: string): ReturnType<typeof lookupMockObject> {
  registerMovableClip(0);
  registerTakeLaneTrack({
    trackIndex: DEST_TRACK,
    initialLanes: 1,
    initialLaneClips: [[{ start: 0, end: 64 }]],
  });
  registerLiveVersion(version);

  return lookupMockObject(undefined, livePath.track(DEST_TRACK).takeLane(0));
}

describe("updateClip - a move inside a take-lane clip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is refused on Live 12.3, creating nothing", async () => {
    const lane = registerWorld("12.3.8");

    await expect(
      updateClip({ id: MOVABLE_CLIP_ID, toPath: `t${DEST_TRACK}/l0[2|1]` }),
    ).rejects.toThrow(
      `not moved: Live 12.3 crashes placing a clip inside another on a take lane (t${DEST_TRACK}/l0[1|1])`,
    );
    expect(lane?.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      expect.anything(),
    );
  });

  it.each(["12.4.16", "13.0"])("goes ahead on Live %s", async (version) => {
    const lane = registerWorld(version);

    await updateClip({
      id: MOVABLE_CLIP_ID,
      toPath: `t${DEST_TRACK}/l0[2|1]`,
    });

    expect(lane?.call).toHaveBeenCalledWith("create_midi_clip", 4, 8);
  });
});
