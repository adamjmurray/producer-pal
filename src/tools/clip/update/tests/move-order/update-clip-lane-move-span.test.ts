// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A looping clip moved onto or off a take lane is re-created, and must keep the
// span it covers on the timeline, not shrink to its loop.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

const SOURCE_ID = "123";
const DEST_TRACK = 5;

/** A 4-bar clip looping a 3-bar region: `length` is the loop's, the span is 16. */
const LOOPING_CLIP = {
  is_arrangement_clip: 1,
  start_time: 8,
  end_time: 24,
  length: 12,
  start_marker: 4,
  loop_start: 4,
  loop_end: 16,
  end_marker: 16,
  looping: 1,
  signature_numerator: 4,
  signature_denominator: 4,
  name: "Verse",
  color: 16711680,
};

/**
 * Register a looping source clip and a destination track with one take lane.
 * @param sourcePath - Where the source sits
 * @param extraProps - What makes it MIDI or audio
 */
function registerWorld(
  sourcePath: PathLike,
  extraProps: Record<string, unknown>,
): void {
  mockNonExistentObjects();
  registerMockObject("live-set", {
    path: livePath.liveSet,
    type: "Song",
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
  registerMockObject(SOURCE_ID, {
    path: sourcePath,
    type: "Clip",
    properties: { ...LOOPING_CLIP, ...extraProps },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });
  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { arrangement_clips: children(SOURCE_ID) },
  });
  registerTakeLaneTrack({
    trackIndex: DEST_TRACK,
    initialLanes: 1,
    // An audio create takes its length from the sample, not the caller.
    clipLength: 4,
    hasMidiInput: extraProps.is_midi_clip === 1 ? 1 : 0,
  });
}

describe("moving a looping arrangement clip through a re-create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("onto a take lane keeps the arrangement span", async () => {
    registerWorld(livePath.track(0).arrangementClip(0), { is_midi_clip: 1 });

    await updateClip({ id: SOURCE_ID, toPath: `t${DEST_TRACK}/l0[5|1]` });

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 16, 16);
  });

  it("off a take lane onto the main lane keeps the arrangement span", async () => {
    registerWorld(livePath.track(0).takeLane(0).arrangementClip(0), {
      is_midi_clip: 1,
    });

    await updateClip({ id: SOURCE_ID, toPath: `t${DEST_TRACK}[5|1]` });

    expect(
      lookupMockObject(undefined, livePath.track(DEST_TRACK))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 16, 16);
  });

  it("says on a looping audio clip's entry that its length changed, and why", async () => {
    registerWorld(livePath.track(0).arrangementClip(0), {
      is_midi_clip: 0,
      is_audio_clip: 1,
      file_path: "/samples/loop.wav",
    });

    const result = (await updateClip({
      id: SOURCE_ID,
      toPath: `t${DEST_TRACK}/l0[5|1]`,
    })) as { detail?: string };

    expect(result.detail).toBe(
      `re-created on t${DEST_TRACK}/l0 ` +
        "(length is 1bar, not 4bar: Live rebuilds an audio clip from its sample)",
    );
  });
});
