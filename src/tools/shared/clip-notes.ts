// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";

/**
 * Get the note count within the playable region of a clip.
 * @param clip - LiveAPI clip object
 * @returns Number of notes in the playable region
 */
export function getPlayableNoteCount(clip: LiveAPI): number {
  const lengthBeats = clip.getProperty("length") as number;
  const result = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, lengthBeats) as string,
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
