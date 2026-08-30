// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { recreateClip } from "../recreate-clip.ts";

const SOURCE_PATH = livePath.track(0).takeLane(0).arrangementClip(0);
const LANE_PATH = livePath.track(0).takeLane(0);

const NOTES = [0, 4, 8, 12].map((start_time) => ({
  pitch: 60,
  start_time,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
}));

/** The source's live state, mutated when the destination replaces it. */
let sourceProps: Record<string, unknown>;
let sourceNotes: Array<Record<string, number>>;

/**
 * Register a 4-bar take-lane source and a destination lane that replaces it on
 * create — what Live does when the copy covers the clip already on the lane.
 */
function registerSelfOverlappingLane(): void {
  sourceNotes = NOTES;
  sourceProps = {
    is_midi_clip: 1,
    is_arrangement_clip: 1,
    length: 16,
    start_time: 0,
    start_marker: 0,
    loop_start: 0,
    loop_end: 16,
    end_marker: 16,
    looping: 1,
    signature_numerator: 4,
    signature_denominator: 4,
    name: "Take 1",
    color: 16711680,
    muted: 1,
  };

  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });
  registerMockObject("src_clip", {
    path: SOURCE_PATH,
    type: "Clip",
    properties: sourceProps,
    methods: {
      get_notes_extended: () => JSON.stringify({ notes: sourceNotes }),
    },
  });
  registerMockObject("copy_clip", {
    path: livePath.track(0).takeLane(0).arrangementClip(1),
    type: "Clip",
    properties: { is_arrangement_clip: 1, start_time: 0 },
  });
  registerMockObject("lane", {
    path: LANE_PATH,
    type: "TakeLane",
    methods: {
      create_midi_clip: () => {
        // Live truncates or replaces whatever the new clip covers. Here that is
        // the source itself: notes gone, length collapsed.
        sourceNotes = [];
        Object.assign(sourceProps, {
          length: 0,
          loop_end: 0,
          end_marker: 0,
          name: "",
          color: 0,
        });

        return ["id", "copy_clip"];
      },
    },
  });
}

// Copying a take onto its own lane makes Live replace the source the instant the
// new clip is created. Reading the source after that read a wiped clip, so the
// copy landed empty and the original was gone with it.
describe("recreateClip onto the source's own lane", () => {
  beforeEach(registerSelfOverlappingLane);

  /**
   * Run the self-overlapping copy.
   * @param color - Color override, or undefined to keep the source's
   */
  function recreateOverSource(color?: string): void {
    recreateClip(
      LiveAPI.from(SOURCE_PATH),
      LiveAPI.from(LANE_PATH),
      0,
      undefined,
      color,
    );
  }

  it("copies the notes the destination wiped", () => {
    recreateOverSource();

    expect(lookupMockObject("copy_clip")?.call).toHaveBeenCalledWith(
      "add_new_notes",
      { notes: NOTES },
    );
  });

  it.each([
    ["loop_end", 16],
    ["end_marker", 16],
    ["name", "Take 1"],
    // No tool writes `muted`, so a copy that arrives unmuted can only be
    // re-muted by hand in Live.
    ["muted", 1],
  ])("copies the %s the destination wiped", (property, value) => {
    recreateOverSource();

    expect(lookupMockObject("copy_clip")?.set).toHaveBeenCalledWith(
      property,
      value,
    );
  });

  it("copies the color the destination wiped", () => {
    recreateOverSource();

    expect(lookupMockObject("copy_clip")?.set).toHaveBeenCalledWith(
      "color",
      16711680,
    );
  });

  it("creates the clip at the source's original length", () => {
    recreateOverSource();

    expect(lookupMockObject("lane")?.call).toHaveBeenCalledWith(
      "create_midi_clip",
      0,
      16,
    );
  });

  // The source's color is skipped when there is an override, so nothing reads a
  // wiped one back.
  it("applies a color override instead of the source's", () => {
    recreateOverSource("#FF00FF");

    expect(lookupMockObject("copy_clip")?.set).not.toHaveBeenCalledWith(
      "color",
      0,
    );
  });
});

describe("recreateClip on an audio source", () => {
  it("copies the source's mute state onto the copy", () => {
    registerMockObject("audio_src", {
      path: SOURCE_PATH,
      type: "Clip",
      properties: {
        is_midi_clip: 0,
        is_audio_clip: 1,
        file_path: "/samples/loop.wav",
        muted: 1,
      },
    });
    registerMockObject("audio_copy", {
      path: livePath.track(0).takeLane(0).arrangementClip(1),
      type: "Clip",
      properties: { is_arrangement_clip: 1 },
    });
    registerMockObject("audio_lane", {
      path: LANE_PATH,
      type: "TakeLane",
      methods: { create_audio_clip: () => ["id", "audio_copy"] },
    });

    recreateClip(
      LiveAPI.from(SOURCE_PATH),
      LiveAPI.from(LANE_PATH),
      0,
      undefined,
      undefined,
    );

    expect(lookupMockObject("audio_copy")?.set).toHaveBeenCalledWith(
      "muted",
      1,
    );
  });
});

// canRecreateClip screens an audio source before any lane is made, so this is
// the narrow window where Live drops the sample in between. Throwing lets the
// caller warn and skip that one copy instead of creating an empty clip.
describe("recreateClip on an audio source with no sample", () => {
  it("throws rather than creating a clip", () => {
    registerMockObject("audio_src", {
      path: livePath.track(0).takeLane(0).arrangementClip(0),
      type: "Clip",
      properties: { is_midi_clip: 0, is_audio_clip: 1, file_path: "" },
    });
    registerMockObject("audio_lane", {
      path: LANE_PATH,
      type: "TakeLane",
      methods: { create_audio_clip: () => ["id", "0"] },
    });

    expect(() =>
      recreateClip(
        LiveAPI.from(SOURCE_PATH),
        LiveAPI.from(LANE_PATH),
        0,
        undefined,
        undefined,
      ),
    ).toThrow("audio clip has no sample file");
    expect(lookupMockObject("audio_lane")?.call).not.toHaveBeenCalled();
  });
});
