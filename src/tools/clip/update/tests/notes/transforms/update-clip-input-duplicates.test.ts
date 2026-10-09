// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import {
  mockMergeNoteTracking,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  DROPPED,
  NOTE,
  setupDuplicateNoteMocks,
} from "./update-clip-duplicates-test-helpers.ts";

type Notation = { notation: "midi-json" | "stark" } | undefined;

const MIDI_JSON = { notation: "midi-json" } as const;
const STARK = { notation: "stark" } as const;
const AT_0 = { ...NOTE, start_time: 0 };
const AT_1 = { ...NOTE, start_time: 1 };
const PILE = [AT_0, AT_1];
const MIDI_JSON_PAIR = "[{p:60,t:0,d:1,v:100},{p:60,t:0,d:1,v:90}]";

interface Case {
  name: string;
  existing: unknown[];
  args: Record<string, string>;
  options?: Notation;
}

const REPORTED: Case[] = [
  {
    name: "bar|beat: two notes at one pitch and start",
    existing: [],
    args: { notes: "C3 C3 1|1" },
  },
  {
    name: "bar|beat: a duplicate at separate time positions",
    existing: [],
    args: { notes: "C3 1|1 C3 1|1" },
  },
  {
    name: "bar|beat: a duplicate a bar copy lands on a new note",
    existing: [],
    args: { notes: "C3 1|1 @2=1 C3 2|1" },
  },
  {
    name: "bar|beat: counted once when a transform runs too",
    existing: [],
    args: { notes: "C3 C3 1|1", transforms: "velocity = 50" },
  },
  {
    name: "bar|beat: an existing note restated twice",
    existing: [AT_0],
    args: { notes: "C3 C3 1|1" },
  },
  {
    name: "midi-json: duplicates inside the input",
    existing: [],
    args: { notes: MIDI_JSON_PAIR },
    options: MIDI_JSON,
  },
  {
    name: "preTransforms: notes piled onto one slot",
    existing: PILE,
    args: { preTransforms: "timing = 0", notes: "E3 1|3" },
  },
  {
    name: "preTransforms: a pile-up counted once when a transform runs too",
    existing: PILE,
    args: {
      preTransforms: "timing = 0",
      notes: "E3 1|3",
      transforms: "velocity = 50",
    },
  },
];

const QUIET: Case[] = [
  {
    name: "bar|beat: restating an existing note",
    existing: [AT_0],
    args: { notes: "C3 1|1" },
  },
  {
    name: "bar|beat: a bar copy landing on an existing note",
    existing: [AT_0, { ...NOTE, start_time: 4 }],
    args: { notes: "2|1 @2=1" },
  },
  {
    name: "bar|beat: a duplicate a delete marker removed",
    existing: [],
    args: { notes: "C3 1|1 v0 C3 1|1" },
  },
  {
    name: "midi-json: restating an existing note",
    existing: [AT_0],
    args: { notes: "[{p:60,t:0,d:1,v:90}]" },
    options: MIDI_JSON,
  },
  {
    name: "bar|beat: a v0 that deletes a preTransform pile-up",
    existing: PILE,
    args: { preTransforms: "timing = 0", notes: "v0 C3 1|1" },
  },
  {
    name: "midi-json: a v:0 that deletes a preTransform pile-up",
    existing: PILE,
    args: { preTransforms: "timing = 0", notes: "[{p:60,t:0,d:1,v:0}]" },
    options: MIDI_JSON,
  },
  {
    name: "a transform that separates a preTransform pile-up",
    existing: PILE,
    args: {
      preTransforms: "timing = 0",
      notes: "E3 1|3",
      transforms: "timing = note.index",
    },
  },
  {
    name: "bar|beat: a transform that pulls the duplicates apart",
    existing: [],
    args: { notes: "C3 C3 1|1", transforms: "pitch += note.index" },
  },
  {
    name: "midi-json: a transform that pulls the duplicates apart",
    existing: [],
    args: { notes: MIDI_JSON_PAIR, transforms: "pitch += note.index" },
    options: MIDI_JSON,
  },
  {
    name: "stark: a transform that pulls the duplicates apart",
    existing: [],
    args: { notes: "kick: X\nC1: X", transforms: "pitch += note.index" },
    options: STARK,
  },
];

describe("updateClip - duplicates inside the new notes", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupDuplicateNoteMocks();
  });

  it.each(REPORTED)("reports $name", async ({ existing, args, options }) => {
    mockMergeNoteTracking(mocks.clip123, existing);

    const result = await updateClip({ id: "123", ...args }, options);

    expect(result).toStrictEqual(expect.objectContaining({ detail: DROPPED }));
  });

  it.each(QUIET)(
    "stays quiet for $name",
    async ({ existing, args, options }) => {
      mockMergeNoteTracking(mocks.clip123, existing);

      const result = await updateClip({ id: "123", ...args }, options);

      expect(result).not.toHaveProperty("detail");
    },
  );

  it("writes one note for a bar|beat duplicate", async () => {
    const { getAddedNotes } = mockMergeNoteTracking(mocks.clip123, []);

    await updateClip({ id: "123", notes: "C3 C3 1|1" });

    expect(getAddedNotes()).toHaveLength(1);
  });

  it("replaces a muted note without reporting it", async () => {
    const { getAddedNotes } = mockMergeNoteTracking(mocks.clip123, [
      { ...AT_0, mute: 1 },
    ]);

    const result = await updateClip({ id: "123", notes: "C3 1|1" });

    expect(result).not.toHaveProperty("detail");
    expect(getAddedNotes()).toStrictEqual([
      expect.objectContaining({ pitch: 60, start_time: 0 }),
    ]);
  });

  it("keeps both notes when a transform pulls bar|beat duplicates apart", async () => {
    const { getAddedNotes } = mockMergeNoteTracking(mocks.clip123, []);

    await updateClip({
      id: "123",
      notes: "C3 C3 1|1",
      transforms: "pitch += note.index",
    });

    expect(getAddedNotes()).toHaveLength(2);
  });

  it("writes nothing when a v0 deletes a preTransform pile-up", async () => {
    mockMergeNoteTracking(mocks.clip123, PILE);

    await updateClip({
      id: "123",
      preTransforms: "timing = 0",
      notes: "v0 C3 1|1",
    });

    expect(mocks.clip123.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });
});
