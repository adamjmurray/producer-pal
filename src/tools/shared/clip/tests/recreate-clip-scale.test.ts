// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  lookupMockObject,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_WITH_CLIP_SCALE,
  LIVE_WITHOUT_CLIP_SCALE,
  registerLiveVersion,
  type ScaleProps,
} from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { failOnSet } from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { recreateClip, recreateClipInSlot } from "../recreate-clip.ts";

const SOURCE_PATH = livePath.track(0).arrangementClip(0);
const TRACK_PATH = livePath.track(1);
const SLOT_PATH = livePath.track(1).clipSlot(0);
const D_DORIAN = { scale_mode: 1, root_note: 2, scale_name: "Dorian" };
const SCALE_PROPERTIES = new Set(["root_note", "scale_name", "scale_mode"]);

/**
 * Register a source clip.
 * @param scale - The scale properties it holds
 * @param isMidi - Whether it is a MIDI clip
 */
function registerSource(scale: Partial<ScaleProps>, isMidi = true): void {
  registerMockObject("src", {
    path: SOURCE_PATH,
    type: "Clip",
    properties: {
      is_midi_clip: isMidi ? 1 : 0,
      is_audio_clip: isMidi ? 0 : 1,
      file_path: isMidi ? "" : "/samples/loop.wav",
      length: 4,
      ...scale,
    },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });
}

/**
 * Register the clip each create lands: on the track's arrangement and in a slot.
 * @returns The new clip
 */
function registerDestinations(): RegisteredMockObject {
  const copy = registerMockObject("copy", {
    path: livePath.track(1).arrangementClip(0),
    type: "Clip",
    properties: { is_arrangement_clip: 1, start_time: 0 },
  });

  registerMockObject("track", {
    path: TRACK_PATH,
    type: "Track",
    methods: {
      create_midi_clip: () => ["id", "copy"],
      create_audio_clip: () => ["id", "copy"],
    },
  });
  registerMockObject("slot", {
    path: SLOT_PATH,
    type: "ClipSlot",
    methods: { create_clip: () => null, create_audio_clip: () => null },
  });
  registerMockObject("slot_copy", {
    path: SLOT_PATH.clip(),
    type: "Clip",
    properties: { is_arrangement_clip: 0 },
  });

  return copy;
}

/**
 * Re-create the source on the track's arrangement.
 * @param losses - Collects what the copy lost
 */
function onArrangement(losses: string[] = []): LiveAPI {
  return recreateClip(
    LiveAPI.from(SOURCE_PATH),
    LiveAPI.from(TRACK_PATH),
    0,
    undefined,
    undefined,
    losses,
  );
}

/**
 * Re-create the source in the slot.
 * @param losses - Collects what the copy lost
 */
function inSlot(losses: string[] = []): LiveAPI {
  return recreateClipInSlot(
    LiveAPI.from(SOURCE_PATH),
    LiveAPI.from(SLOT_PATH),
    undefined,
    undefined,
    losses,
  );
}

/**
 * The scale properties a clip was written, in order.
 * @param clip - The registered clip
 * @returns [property, value] pairs
 */
function scaleWrites(clip: RegisteredMockObject | undefined): unknown[][] {
  return (clip?.set.mock.calls ?? []).filter(([property]) =>
    SCALE_PROPERTIES.has(property as string),
  );
}

describe("re-creating a MIDI clip keeps its own scale", () => {
  beforeEach(() => {
    registerLiveVersion(LIVE_WITH_CLIP_SCALE);
  });

  it("gives the copy on a lane the source's scale, mode last", () => {
    registerSource(D_DORIAN);
    const copy = registerDestinations();

    onArrangement();

    expect(scaleWrites(copy)).toStrictEqual([
      ["root_note", 2],
      ["scale_name", "Dorian"],
      ["scale_mode", 1],
    ]);
  });

  it("gives the copy in a slot the source's scale", () => {
    registerSource(D_DORIAN);
    registerDestinations();

    inSlot();

    expect(scaleWrites(lookupMockObject("slot_copy"))).toStrictEqual([
      ["root_note", 2],
      ["scale_name", "Dorian"],
      ["scale_mode", 1],
    ]);
  });

  // A new clip starts with the Live Set's scale, so "off" has to be written.
  it("keeps a scale that is off, root and name included", () => {
    registerSource({ scale_mode: 0, root_note: 5, scale_name: "Major" });
    const copy = registerDestinations();

    const losses: string[] = [];

    onArrangement(losses);

    expect(scaleWrites(copy)).toStrictEqual([
      ["root_note", 5],
      ["scale_name", "Major"],
      ["scale_mode", 0],
    ]);
    expect(losses).toStrictEqual([]);
  });

  it("writes no scale on a Live that gives clips none", () => {
    registerLiveVersion(LIVE_WITHOUT_CLIP_SCALE);
    registerSource(D_DORIAN);
    const copy = registerDestinations();

    onArrangement();

    expect(scaleWrites(copy)).toStrictEqual([]);
  });

  it("writes no scale on an audio clip", () => {
    registerSource(D_DORIAN, false);
    const copy = registerDestinations();

    onArrangement();

    expect(scaleWrites(copy)).toStrictEqual([]);
  });

  // The clip and its notes are already there, so the scale is a loss to
  // report, not a failure of the copy.
  it("reports the scale as lost, and still returns the clip, when the write throws", () => {
    registerSource(D_DORIAN);
    const copy = registerDestinations();

    failOnSet(copy, "scale_mode");

    const losses: string[] = [];
    const created = onArrangement(losses);

    expect(created.id).toBe("copy");
    expect(losses).toStrictEqual(["scale isn't copied"]);
    expect(copy.set).toHaveBeenCalledWith("name", expect.anything());
  });
});
