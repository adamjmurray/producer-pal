// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";

/**
 * Count the notes in a clip using the SAME window read-clip reads:
 * [-length, 2*length] in beats, pitches 0–127. This includes out-of-bounds
 * notes (a pickup before the start, overhang past the end), so the count
 * matches what read-clip returns — what Live actually stored, not just the
 * playable region [0, length]. Notes more than one clip-length outside the
 * region are still missed (the same finite-scan bound read-clip uses).
 * @param clip - LiveAPI clip object
 * @returns Number of notes in the read window
 */
export function getClipNoteCount(clip: LiveAPI): number {
  const lengthBeats = clip.getProperty("length") as number;
  const result = JSON.parse(
    clip.call(
      "get_notes_extended",
      0,
      128,
      -lengthBeats,
      lengthBeats * 3,
    ) as string,
  );

  return result?.notes?.length ?? 0;
}

/**
 * Normalize raw notes from get_notes_extended into NoteEvents for add_new_notes.
 * The Live API returns extra properties (note_id, mute, release_velocity) that
 * must be stripped before re-adding, or stale note_ids get re-fed on repeated
 * writes (e.g. copying one source to multiple positions).
 * @param rawNotes - Note objects from get_notes_extended
 * @returns NoteEvents safe to pass to add_new_notes
 */
export function rawNotesToNoteEvents(
  rawNotes: Record<string, unknown>[],
): NoteEvent[] {
  return rawNotes.map((rawNote) => ({
    pitch: rawNote.pitch as number,
    start_time: rawNote.start_time as number,
    duration: rawNote.duration as number,
    velocity: rawNote.velocity as number,
    probability: rawNote.probability as number,
    velocity_deviation: rawNote.velocity_deviation as number,
  }));
}
