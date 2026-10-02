// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { recreateClip, recreateClipInSlot } from "../recreate-clip.ts";

const SOURCE_PATH = livePath.track(0).arrangementClip(0);
const LANE_PATH = livePath.track(0).takeLane(0);
const COPY_PATH = livePath.track(0).takeLane(0).arrangementClip(0);

/**
 * A 4-bar arrangement clip looping a 3-bar region: `length` is the loop's 12
 * beats, but the clip covers 16.
 */
const LOOPING_SOURCE = {
  is_arrangement_clip: 1,
  start_time: 16,
  end_time: 32,
  length: 12,
  start_marker: 4,
  loop_start: 4,
  loop_end: 16,
  end_marker: 16,
  looping: 1,
  signature_numerator: 4,
  signature_denominator: 4,
};

/**
 * Register the looping source, a lane whose create lands a clip of the given
 * span, and that clip.
 * @param source - The source's type-specific properties
 * @param createMethod - The lane call that creates the clip
 * @param landedSpan - How long the clip Live makes is, in beats
 * @returns The lane
 */
function registerWorld(
  source: Record<string, unknown>,
  createMethod: string,
  landedSpan: number,
): ReturnType<typeof registerMockObject> {
  registerMockObject("src", {
    path: SOURCE_PATH,
    type: "Clip",
    properties: { ...LOOPING_SOURCE, ...source },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });
  registerMockObject("copy", {
    path: COPY_PATH,
    type: "Clip",
    properties: {
      is_arrangement_clip: 1,
      start_time: 40,
      end_time: 40 + landedSpan,
    },
  });

  return registerMockObject("lane", {
    path: LANE_PATH,
    type: "TakeLane",
    methods: { [createMethod]: () => ["id", "copy"] },
  });
}

/**
 * Re-create the source onto the lane at beat 40.
 * @returns What the copy lost
 */
function recreate(): string[] {
  const losses: string[] = [];

  recreateClip(
    LiveAPI.from(SOURCE_PATH),
    LiveAPI.from(LANE_PATH),
    40,
    undefined,
    undefined,
    losses,
  );

  return losses;
}

describe("recreateClip on a looping arrangement MIDI clip", () => {
  it("creates the copy at the arrangement span, not the loop length", () => {
    const lane = registerWorld({ is_midi_clip: 1 }, "create_midi_clip", 16);

    expect(recreate()).toStrictEqual([]);
    expect(lane.call).toHaveBeenCalledWith("create_midi_clip", 40, 16);
  });

  it("still writes the loop and markers the source had", () => {
    registerWorld({ is_midi_clip: 1 }, "create_midi_clip", 16);
    recreate();

    const copy = lookupMockObject("copy");

    expect(copy?.set).toHaveBeenCalledWith("start_marker", 4);
    expect(copy?.set).toHaveBeenCalledWith("loop_start", 4);
    expect(copy?.set).toHaveBeenCalledWith("loop_end", 16);
    expect(copy?.set).toHaveBeenCalledWith("end_marker", 16);
    expect(copy?.set).toHaveBeenCalledWith("looping", 1);
  });

  // The loop (16) is longer than what the clip shows (8).
  it("keeps the span of a clip shorter than its loop", () => {
    const lane = registerWorld(
      {
        is_midi_clip: 1,
        end_time: 24,
        length: 16,
        start_marker: 0,
        loop_start: 0,
      },
      "create_midi_clip",
      8,
    );

    expect(recreate()).toStrictEqual([]);
    expect(lane.call).toHaveBeenCalledWith("create_midi_clip", 40, 8);

    const copy = lookupMockObject("copy");

    expect(copy?.set).toHaveBeenCalledWith("loop_start", 0);
    expect(copy?.set).toHaveBeenCalledWith("loop_end", 16);
    expect(copy?.set).toHaveBeenCalledWith("end_marker", 16);
  });

  it("reports it when Live still makes the copy shorter", () => {
    registerWorld({ is_midi_clip: 1 }, "create_midi_clip", 12);

    expect(recreate()).toStrictEqual([
      "length is 3bar, not 4bar: Live shortened the new clip",
    ]);
  });

  it("uses the loop length for a session source, which has no span", () => {
    const lane = registerWorld(
      { is_midi_clip: 1, is_arrangement_clip: 0 },
      "create_midi_clip",
      12,
    );

    expect(recreate()).toStrictEqual([]);
    expect(lane.call).toHaveBeenCalledWith("create_midi_clip", 40, 12);
  });
});

describe("recreateClipInSlot from a looping arrangement MIDI clip", () => {
  it("still creates the slot clip at the loop length", () => {
    registerMockObject("src", {
      path: SOURCE_PATH,
      type: "Clip",
      properties: { ...LOOPING_SOURCE, is_midi_clip: 1 },
      methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
    });

    const slotPath = livePath.track(1).clipSlot(0);
    const slot = registerMockObject("slot", {
      path: slotPath,
      type: "ClipSlot",
      methods: {
        create_clip: () => {
          registerMockObject("slot_clip", {
            path: slotPath.clip(),
            type: "Clip",
          });

          return null;
        },
      },
    });
    const losses: string[] = [];

    recreateClipInSlot(
      LiveAPI.from(SOURCE_PATH),
      LiveAPI.from(slotPath),
      undefined,
      undefined,
      losses,
    );

    expect(slot.call).toHaveBeenCalledWith("create_clip", 12);
    expect(losses).toStrictEqual([]);
  });
});

describe("recreateClip on a looping arrangement audio clip", () => {
  const AUDIO = {
    is_midi_clip: 0,
    is_audio_clip: 1,
    file_path: "/samples/loop.wav",
  };

  it("says the new length and why when the sample gives a different one", () => {
    registerWorld(AUDIO, "create_audio_clip", 8);

    expect(recreate()).toStrictEqual([
      "length is 2bar, not 4bar: Live rebuilds an audio clip from its sample",
    ]);
  });

  it("says nothing when the copy comes out the same length", () => {
    registerWorld(AUDIO, "create_audio_clip", 16);

    expect(recreate()).toStrictEqual([]);
  });
});
