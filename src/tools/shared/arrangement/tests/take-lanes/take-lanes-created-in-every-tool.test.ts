// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Take lanes can't be deleted, so every tool that fills in the lanes below the
// one a path names says which lanes it made, in the one spelling.

import { describe, expect, it } from "vitest";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  duplicateToLanes,
  registerArrangementSource,
  registerLiveSet,
  registerMainLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { updateTrack } from "#src/tools/track/update/update-track.ts";
import {
  MOVABLE_CLIP_ID,
  registerMovableClip,
} from "#src/tools/clip/update/tests/arrangement/movable-clip-test-helpers.ts";
import {
  registerTakeLaneTrack,
  stopMakingTakeLanesAfter,
} from "../helpers/take-lane-test-helpers.ts";

/** A call, run on a track with no lanes, and the `created` its entry reports. */
type ToolCall = () => Promise<{ created?: string } | undefined>;

// Each tool writes to a lane (`l2`) two past the end of a track with none, so
// each has to fill in `l0` and `l1` as well. Every setup leaves t0 free for the
// lane track, which the test registers after it.
const TOOLS: Array<[string, () => void, ToolCall]> = [
  [
    "create-clip",
    registerLiveSet,
    async () =>
      (await createClip({ path: "t0/l2[1|1]", notes: "C3" })) as {
        created?: string;
      },
  ],
  [
    // The clip starts on t1, so the move is onto another track's new lane.
    "update-clip move",
    () => registerMovableClip(1),
    async () =>
      (await updateClip({ id: MOVABLE_CLIP_ID, toPath: "t0/l2[9|1]" })) as {
        created?: string;
      },
  ],
  [
    // A copy onto a lane is re-created there: Live can't duplicate onto one.
    "duplicate of a clip",
    () => {
      registerLiveSet();
      registerArrangementSource(true);
    },
    async () =>
      (await duplicate({
        type: "clip",
        id: "src_clip",
        toPath: "t0/l2[1|1]",
      })) as { created?: string },
  ],
  [
    // Copies the track's main-lane clips; the entry is the lane's, not a clip's.
    "duplicate of a track onto a lane",
    () => {
      registerLiveSet();
      registerMainLaneSource([0]);
    },
    async () =>
      await duplicateToLanes<{ created?: string }>({
        id: "src_track",
        toPath: "t0/l2",
      }),
  ],
  [
    // The lane itself is the target, so there is no clip to set up.
    "update-track",
    () => undefined,
    async () => updateTrack({ path: "t0/l2" }) as { created?: string },
  ],
];

describe("take lanes made on the way to a path past the last lane", () => {
  it.each(TOOLS)("%s names every lane it made", async (_tool, setup, call) => {
    setup();
    registerTakeLaneTrack({ initialLanes: 0 });

    const entry = await call();

    expect(entry?.created).toBe("l0-l2");
  });

  // The lanes Live did make stay, so they are said even though the call failed.
  // Live gives up on the second, so `l0` is the whole of what was made.
  it.each(TOOLS)(
    "%s names the lanes made before Live stopped",
    async (_tool, setup, call) => {
      setup();

      stopMakingTakeLanesAfter(registerTakeLaneTrack({ initialLanes: 0 }));

      const entry = await call();

      expect(entry?.created).toBe("l0");
    },
  );
});
