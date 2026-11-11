// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  expectNoNotesApiCalls,
  type MidiClipEra,
  setMidiClipType,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import {
  clearMockRegistry,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  canRecreateClip,
  recreateBlocker,
  recreateClip,
  recreateClipInSlot,
  STEP_SEQUENCER_NO_REBUILD,
} from "../recreate-clip.ts";

/**
 * Register a MIDI clip and a destination track and slot, so a create would land.
 * @param era - Which Live's `midi_clip_type` answer the clip gives
 * @returns The source clip, the track and the slot
 */
function register(era: MidiClipEra): {
  source: RegisteredMockObject;
  track: RegisteredMockObject;
  slot: RegisteredMockObject;
} {
  const source = registerMockObject("src", {
    path: livePath.track(0).takeLane(0).arrangementClip(0),
    type: "Clip",
    properties: { is_midi_clip: 1, length: 4, name: "Beat" },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });

  setMidiClipType(source, era);

  const track = registerMockObject("track", {
    path: livePath.track(1),
    type: "Track",
    properties: { has_midi_input: 1 },
  });
  const slot = registerMockObject("slot", {
    path: livePath.track(1).clipSlot(0),
    properties: { has_clip: 0 },
  });

  return { source, track, slot };
}

describe("recreating a Live 13 step sequencer clip", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("can't: the gate says so, wherever it is asked", () => {
    const { source } = register("step-sequencer");
    const clip = LiveAPI.from("id src");

    expect(recreateBlocker(clip)).toBe(STEP_SEQUENCER_NO_REBUILD);
    expect(canRecreateClip(clip)).toBe(false);
    expectNoNotesApiCalls(source);
  });

  it.each<MidiClipEra>(["notes", "live-12"])(
    "can for a MIDI clip that isn't one (%s)",
    (era) => {
      register(era);

      expect(recreateBlocker(LiveAPI.from("id src"))).toBeNull();
    },
  );

  it("is refused by the re-create itself too, before anything is created", () => {
    const { source, track, slot } = register("step-sequencer");
    const clip = LiveAPI.from("id src");

    expect(() =>
      recreateClip(clip, LiveAPI.from("id track"), 0, undefined, undefined, []),
    ).toThrow(STEP_SEQUENCER_NO_REBUILD);
    expect(() =>
      recreateClipInSlot(
        clip,
        LiveAPI.from("id slot"),
        undefined,
        undefined,
        [],
      ),
    ).toThrow(STEP_SEQUENCER_NO_REBUILD);

    expect(track.call).not.toHaveBeenCalled();
    expect(slot.call).not.toHaveBeenCalled();
    expectNoNotesApiCalls(source);
  });
});
