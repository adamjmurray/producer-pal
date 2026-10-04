// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What a write goes over depends on the kind of clip: an arrangement clip moved
// into a slot fills it, and a take-lane clip resized in place writes nothing.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { registerLiveSet } from "../batch/stacking-track-test-helpers.ts";

const TAKE_LANE_REFUSAL =
  "arrangementLength ignored: this is a take-lane clip; adjust it in Live's UI";

describe("updateClip - what each kind of clip's write goes over", () => {
  it("lets an arrangement clip moved into a slot overwrite an earlier move there", async () => {
    const mocks = setupUpdateClipMocks();

    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip789, {
      is_arrangement_clip: 1,
      start_time: 0,
      end_time: 4,
    });
    registerMockObject("dest-track", {
      path: livePath.track(1),
      properties: { has_midi_input: 1, is_frozen: 0 },
    });

    const result = (await updateClip({
      id: "123,789",
      toPath: "t1/s3,t1/s3",
    })) as ClipResult[];

    expect(result[0]).toStrictEqual({
      id: "123",
      detail: "overwritten later in this call by t1/s3",
    });
    expect(result[1]?.path).toBe("t1/s3");
  });

  it("doesn't let a refused take-lane resize overwrite a clip it would reach", async () => {
    registerLiveSet();
    registerTakeLaneTrack({
      initialLanes: 1,
      initialLaneClips: [
        [
          { start: 0, end: 4 },
          { start: 4, end: 8 },
        ],
      ],
    });

    const [first, second] = [0, 1].map(
      (index) =>
        lookupMockObject(
          undefined,
          livePath.track(0).takeLane(0).arrangementClip(index),
        )?.id as string,
    );

    // Grown in place, the later clip would reach over all of the earlier one.
    const result = (await updateClip({
      id: `${second},${first}`,
      arrangementLength: "1bar,4bar",
    })) as ClipResult[];

    expect(result).toStrictEqual([
      { id: second, ok: false, detail: TAKE_LANE_REFUSAL },
      { id: first, ok: false, detail: TAKE_LANE_REFUSAL },
    ]);
  });
});
