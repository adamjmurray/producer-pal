// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";

/**
 * Count the notes in a clip across the same window read-clip reads (see
 * {@link readAllClipNotes}), so the count matches what read-clip returns —
 * including a pickup before the start and overhang past the end, not just the
 * playable region [0, length].
 * @param clip - LiveAPI clip object
 * @returns Number of notes in the read window
 */
export function getClipNoteCount(clip: LiveAPI): number {
  return readAllClipNotes(clip).length;
}

/**
 * Read every note in a clip's scan window as raw Live API note objects (each
 * still carries note_id, mute, release_velocity — run through
 * {@link rawNotesToNoteEvents} before re-adding). Uses the same
 * [-length, 2*length] window as read-clip and {@link getClipNoteCount}, so a
 * pickup before the clip start (negative start_time) and overhang past the end
 * are seen — not just the playable region [0, length].
 * @param clip - LiveAPI clip object
 * @returns Raw note objects, or [] when the window holds no notes
 */
export function readAllClipNotes(clip: LiveAPI): Record<string, unknown>[] {
  const [fromTime, timeSpan] = clipNoteScanWindow(clip);
  const result = JSON.parse(
    clip.call("get_notes_extended", 0, 128, fromTime, timeSpan) as string,
  );

  return (result?.notes ?? []) as Record<string, unknown>[];
}

/**
 * Remove every note in a clip's scan window. MUST mirror
 * {@link readAllClipNotes}' window: a write path reads all notes, mutates them,
 * removes, then re-adds — so removing a WIDER range than was read would delete
 * notes (a far pickup/overhang) that were never read back and re-added.
 * @param clip - LiveAPI clip object
 */
export function removeAllClipNotes(clip: LiveAPI): void {
  const [fromTime, timeSpan] = clipNoteScanWindow(clip);

  clip.call("remove_notes_extended", 0, 128, fromTime, timeSpan);
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

// --- Private helpers ---

/**
 * The (from_time, time_span) pair for read-clip's note-scan window:
 * [-length, 2*length] in beats. Centered to include a pickup before the clip
 * start and overhang past the end. Read AND remove share this single source so
 * the two windows can never drift — an asymmetry would either miss notes (too
 * narrow a read) or destroy unread notes (too wide a remove). Notes more than
 * one clip-length outside the region are still missed (the finite-scan bound
 * read-clip documents).
 * @param clip - LiveAPI clip object
 * @returns [fromTime, timeSpan] for get_notes_extended / remove_notes_extended
 */
function clipNoteScanWindow(clip: LiveAPI): [number, number] {
  const lengthBeats = clip.getProperty("length") as number;

  return [-lengthBeats, lengthBeats * 3];
}
