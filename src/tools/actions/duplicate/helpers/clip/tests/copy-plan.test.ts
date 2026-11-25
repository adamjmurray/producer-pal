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

/**
 * A 4-beat MIDI clip on a take lane.
 * @returns A handle on the clip
 */
function takeLaneClip(): LiveAPI {
  const path = livePath.track(0).takeLane(0).arrangementClip(0);

  registerMockObject("take", {
    path,
    properties: {
      is_midi_clip: 1,
      is_arrangement_clip: 1,
      start_time: 0,
      end_time: 4,
      length: 4,
    },
  });

  return LiveAPI.from(path);
}

describe("copySpanBeats", () => {
  it("counts a looped session clip's pre-roll in a plain copy", () => {
    expect(copySpanBeats(loopedWithPreRoll(), undefined, 4, 4, false)).toBe(8);
  });

  it("is the length asked for when one is", () => {
    expect(copySpanBeats(loopedWithPreRoll(), "1bar", 4, 4, false)).toBe(4);
  });

  // Re-created at its own length, then resized: only the main lane clears
  // ahead of a clip that grows.
  it("is a take's own length on a take lane, whatever was asked", () => {
    expect(copySpanBeats(takeLaneClip(), "4bar", 4, 4, true)).toBe(4);
  });

  it("is the longer of a take's length and the one asked on the main lane", () => {
    expect(copySpanBeats(takeLaneClip(), "4bar", 4, 4, false)).toBe(16);
    expect(copySpanBeats(takeLaneClip(), "n/4", 4, 4, false)).toBe(4);
  });
});
