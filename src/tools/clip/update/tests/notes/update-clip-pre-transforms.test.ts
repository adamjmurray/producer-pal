// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  mockMergeNoteTracking,
  setupAudioClipMock,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

interface AddedNote {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  probability: number;
  velocity_deviation: number;
}

/**
 * Build a clip note with sensible defaults.
 * @param pitch - MIDI pitch
 * @param start - Start beat
 * @param velocity - Velocity (default 100)
 * @returns Note suitable for mockMergeNoteTracking
 */
function note(pitch: number, start: number, velocity = 100): AddedNote {
  return {
    pitch,
    start_time: start,
    duration: 1,
    velocity,
    probability: 1,
    velocity_deviation: 0,
  };
}

/**
 * Read back the most recent set of notes passed to add_new_notes.
 * @param clip - Registered mock clip
 * @returns Notes from the last add_new_notes call (empty if none)
 */
function addedNotes(clip: UpdateClipMocks["clip123"]): AddedNote[] {
  const calls = clip.call.mock.calls.filter(
    (c: unknown[]) => c[0] === "add_new_notes",
  );
  const last = calls.at(-1) as [string, { notes: AddedNote[] }] | undefined;

  return last?.[1].notes ?? [];
}

describe("updateClip - preTransforms", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, { length: 8 });
  });

  it("clears the targeted region in existing notes before merging new ones", async () => {
    // Bar 1: notes at beats 1..4 (start_time 0..3).
    // Bar 2: notes at beats 1..2 (start_time 4..5).
    mockMergeNoteTracking(mocks.clip123, [
      note(60, 0), // C3
      note(62, 1), // D3
      note(64, 2), // E3
      note(65, 3), // F3
      note(67, 4), // G3
      note(69, 5), // A3
    ]);

    await updateClip({
      ids: "123",
      preTransforms: "1|1-1|4: velocity = 0", // clears all of bar 1
      notes: "C4 1|1 D4 1|2 E4 1|3 F4 1|4",
    });

    const finalNotes = addedNotes(mocks.clip123);
    const bar1 = finalNotes.filter((n) => n.start_time < 4);
    const bar2 = finalNotes.filter((n) => n.start_time >= 4);
    const bar1Pitches = bar1.map((n) => n.pitch).toSorted((a, b) => a - b);
    const bar2Pitches = bar2.map((n) => n.pitch).toSorted((a, b) => a - b);

    // Bar 1: original 60/62/64/65 cleared by preTransforms; only new 72/74/76/77 land
    expect(bar1Pitches).toStrictEqual([72, 74, 76, 77]);
    // Bar 2: original 67/69 preserved
    expect(bar2Pitches).toStrictEqual([67, 69]);
  });

  it("can mutate existing notes (not just delete) before merge", async () => {
    mockMergeNoteTracking(mocks.clip123, [note(60, 0, 100), note(62, 1, 100)]);

    const result = await updateClip({
      ids: "123",
      preTransforms: "velocity = 60", // no range → all notes
      notes: "v110 G3 1|3", // new note at start_time 2, pitch 67
    });

    const finalNotes = addedNotes(mocks.clip123);
    const byPitch = new Map(finalNotes.map((n) => [n.pitch, n.velocity]));

    expect(byPitch.get(60)).toBe(60); // existing C3, pre-mutated
    expect(byPitch.get(62)).toBe(60); // existing D3, pre-mutated
    expect(byPitch.get(67)).toBe(110); // new G3 unchanged by preTransforms
    // With no transforms string, the result reports the preTransform match count
    expect((result as { transformed?: number }).transformed).toBe(2);
  });

  it("applies preTransforms BEFORE transforms (so post-merge transforms see all notes)", async () => {
    mockMergeNoteTracking(mocks.clip123, [note(60, 0, 100), note(62, 1, 100)]);

    await updateClip({
      ids: "123",
      preTransforms: "1|1-1|1: velocity = 0", // delete pitch 60 at beat 1 only
      notes: "G3 1|3", // pitch 67 at start_time 2
      transforms: "velocity += 5", // bumps survivors + new note
    });

    const finalNotes = addedNotes(mocks.clip123);
    const byPitch = new Map(finalNotes.map((n) => [n.pitch, n.velocity]));

    expect(byPitch.has(60)).toBe(false); // killed by preTransforms
    expect(byPitch.get(62)).toBe(105); // surviving existing + post-transform bump
    expect(byPitch.get(67)).toBe(105); // new note + post-transform bump
  });

  it("broadcasts a single preTransforms string across multiple clips", async () => {
    setupMidiClipMock(mocks.clip456, { length: 8 });
    mockMergeNoteTracking(mocks.clip123, [note(60, 0), note(67, 4)]);
    mockMergeNoteTracking(mocks.clip456, [note(62, 0), note(69, 4)]);

    await updateClip({
      ids: "123, 456",
      preTransforms: "1|1-1|4: velocity = 0",
      notes: "A4 1|1", // pitch 81 at start_time 0
    });

    const clip123Final = addedNotes(mocks.clip123)
      .map((n) => n.pitch)
      .toSorted((a, b) => a - b);
    const clip456Final = addedNotes(mocks.clip456)
      .map((n) => n.pitch)
      .toSorted((a, b) => a - b);

    expect(clip123Final).toStrictEqual([67, 81]); // bar 2 G3 + new bar 1 A4
    expect(clip456Final).toStrictEqual([69, 81]); // bar 2 A3 + new bar 1 A4
  });

  it("clears the whole clip with bare preTransforms and no notes", async () => {
    mockMergeNoteTracking(mocks.clip123, [note(60, 0), note(62, 1)]);

    await updateClip({
      ids: "123",
      preTransforms: "v0", // clear everything, no new notes
    });

    // Existing notes removed and nothing re-added: the clip ends up empty
    expect(mocks.clip123.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      // Window varies with clip length; clip-notes.test.ts pins it exactly.
      expect.any(Number),
      expect.any(Number),
    );
    expect(addedNotes(mocks.clip123)).toStrictEqual([]);
  });

  it("edits existing notes with preTransforms and no notes (no merge)", async () => {
    mockMergeNoteTracking(mocks.clip123, [note(60, 0, 100), note(62, 1, 100)]);

    await updateClip({
      ids: "123",
      preTransforms: "velocity = 50", // no range, no new notes → edit all in place
    });

    const finalNotes = addedNotes(mocks.clip123);
    const byPitch = new Map(finalNotes.map((n) => [n.pitch, n.velocity]));

    expect(byPitch.get(60)).toBe(50);
    expect(byPitch.get(62)).toBe(50);
  });

  it("warns and ignores preTransforms on audio clips", async () => {
    setupAudioClipMock(mocks.clip123, { length: 8 });

    await updateClip({
      ids: "123",
      preTransforms: "1|1-1|4: velocity = 0",
      gainDb: -6,
    });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        "preTransforms parameter ignored for audio clips",
      ),
    );
  });
});
