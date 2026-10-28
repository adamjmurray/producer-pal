// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How far a copy clears is how long it comes out: a looped session clip's
// pre-roll counts, so a spare is never left where such a copy lands.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { copySpanBeats } from "../copy-plan.ts";

const CLIP_PATH = livePath.track(0).clipSlot(0).clip();

/**
 * A looped MIDI session clip: a 4-beat loop with 4 beats of pre-roll.
 * @returns A handle on the clip
 */
function loopedWithPreRoll(): LiveAPI {
  registerMockObject("clip", {
    path: CLIP_PATH,
    properties: {
      is_midi_clip: 1,
      is_arrangement_clip: 0,
      looping: 1,
      length: 4,
      start_marker: 0,
      loop_start: 4,
      loop_end: 8,
    },
  });

  return LiveAPI.from(CLIP_PATH);
}

describe("copySpanBeats", () => {
  it("counts a looped session clip's pre-roll in a plain copy", () => {
    expect(copySpanBeats(loopedWithPreRoll(), undefined, 4, 4)).toBe(8);
  });

  it("is the length asked for when one is", () => {
    expect(copySpanBeats(loopedWithPreRoll(), "1bar", 4, 4)).toBe(4);
  });
});
