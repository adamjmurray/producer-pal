// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A looping arrangement clip re-created on a lane, or promoted off one, keeps
// the span it covers on the timeline (not its shorter loop length), or says
// when it can't.

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import "../../duplicate-mocks-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  CLIPS_ONLY,
  duplicateToLanes,
  type LaneCopyEntry,
  registerArrangementSource,
  registerLiveSet,
  registerMainLaneClip,
  registerMainLaneSource,
  registerTakeLaneSource,
} from "#src/tools/actions/duplicate/helpers/duplicate-take-lane-test-helpers.ts";

/** A 4-bar clip at beat 0 looping a 3-bar region: loop length 12, span 16. */
const LOOPING = {
  end_time: 16,
  length: 12,
  start_marker: 4,
  loop_start: 4,
  loop_end: 16,
  end_marker: 16,
};

const AUDIO = { is_midi_clip: 0, is_audio_clip: 1, file_path: "/s/loop.wav" };

describe("duplicating a looping MIDI clip by re-creating it", () => {
  it("onto a take lane keeps the span", async () => {
    registerLiveSet();
    registerArrangementSource(true, undefined, { extraProps: LOOPING });
    registerTakeLaneTrack({ initialLanes: 0 });

    await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "5|1",
      takeLane: 1,
    });

    expect(
      lookupMockObject(undefined, livePath.track(0).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 16, 16);
  });

  it("off a take lane onto the main lane keeps the span", async () => {
    registerLiveSet();

    const track = registerTakeLaneTrack({ initialLanes: 1 });

    registerTakeLaneSource(LOOPING);

    await duplicate({
      type: "clip",
      id: "tl_src_clip",
      arrangementStart: "5|1",
    });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 16, 16);
  });

  it("through a track copied onto a lane keeps the span", async () => {
    registerMainLaneSource([0], {}, LOOPING);

    const lane = registerTakeLaneTrack({ trackIndex: 1, initialLanes: 1 });

    await duplicateToLanes<LaneCopyEntry>({ id: "src_track", toPath: "t1/l0" });

    expect(
      lookupMockObject(undefined, livePath.track(1).takeLane(0))?.call,
    ).toHaveBeenCalledWith("create_midi_clip", 0, 16);
    expect(lane.call).not.toHaveBeenCalledWith(
      "create_midi_clip",
      expect.anything(),
      12,
    );
  });
});

// create_audio_clip takes no length, and the mock gives the new clip 4 beats.
describe("duplicating a looping audio clip by re-creating it", () => {
  const SAID =
    "length is 1bar, not 4bar: Live rebuilds an audio clip from its sample";

  it("says on the copy's entry that its length changed, and why", async () => {
    registerLiveSet();
    registerArrangementSource(false, undefined, {
      extraProps: { ...LOOPING, ...AUDIO },
    });
    registerTakeLaneTrack({ initialLanes: 0, hasMidiInput: 0 });

    const result = (await duplicate({
      type: "clip",
      id: "src_clip",
      arrangementStart: "5|1",
      takeLane: 1,
    })) as { detail?: string };

    expect(result.detail).toContain(SAID);
  });

  it("says it on the clip's entry when a track is copied onto a lane", async () => {
    registerMainLaneSource(
      [0],
      { has_midi_input: 0 },
      { ...LOOPING, ...AUDIO },
    );
    registerTakeLaneTrack({ trackIndex: 1, initialLanes: 1, hasMidiInput: 0 });

    const result = await duplicateToLanes<LaneCopyEntry>({
      id: "src_track",
      toPath: "t1/l0",
    });

    expect(result.clips[0]?.detail).toBe(SAID);
    expect(result.detail).toBe(CLIPS_ONLY);
  });

  // Two clips on the lane: only the first comes out a different length, so only
  // its own entry says so, and the lane's shared detail stays quiet.
  it("puts the change on the clip's own entry, not the lane's", async () => {
    registerLiveSet();

    const ids = [
      registerMainLaneClip(0, 0, { ...AUDIO, ...LOOPING }),
      registerMainLaneClip(1, 16, { ...AUDIO, end_time: 20 }),
    ];

    registerMockObject("src_track", {
      path: livePath.track(0),
      properties: {
        has_midi_input: 0,
        is_foldable: 0,
        take_lanes: children(),
        arrangement_clips: children(...ids),
      },
    });
    registerTakeLaneTrack({ trackIndex: 1, initialLanes: 1, hasMidiInput: 0 });

    const result = await duplicateToLanes<LaneCopyEntry>({
      id: "src_track",
      toPath: "t1/l0",
    });

    expect(result.clips.map((clip) => clip.detail)).toStrictEqual([
      SAID,
      undefined,
    ]);
    expect(result.detail).toBe(CLIPS_ONLY);
  });
});
