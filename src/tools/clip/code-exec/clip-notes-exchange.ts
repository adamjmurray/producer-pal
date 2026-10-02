// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Moves notes between a Live clip and the code-facing note format.

import {
  codeNoteToNoteEvent,
  noteEventToCodeNote,
} from "#src/notation/midi-json/midi-json-note.ts";
import { dedupeAndSortNotes } from "#src/notation/note-sort.ts";
import {
  rawNotesToCopiedNotes,
  rawNotesToNoteEvents,
  readClipNotes,
  removeAllClipNotes,
} from "#src/tools/shared/clip/clip-notes.ts";
import { type CodeNote } from "./code-exec-types.ts";

/**
 * Extract notes from a clip.
 *
 * @param clip - LiveAPI clip object
 * @returns Array of notes in code-facing format
 */
export function extractNotesFromClip(clip: LiveAPI): CodeNote[] {
  const timeSigDenominator = clip.getProperty(
    "signature_denominator",
  ) as number;
  // Read the same window as read-clip, so user code sees a pickup before the
  // clip start too.
  // Muted notes are hidden, as in read-clip; applyNotesToClip keeps them.
  const notes = rawNotesToNoteEvents(readClipNotes(clip).visible);

  return notes.map((note) => noteEventToCodeNote(note, timeSigDenominator));
}

/**
 * Apply notes to a clip, replacing all its visible notes. Muted notes are
 * hidden from user code, so they stay in the clip as they were.
 *
 * @param clip - LiveAPI clip object
 * @param notes - Array of notes in code-facing format
 * @returns How many same-pitch+start duplicates were dropped
 */
export function applyNotesToClip(clip: LiveAPI, notes: CodeNote[]): number {
  const { muted } = readClipNotes(clip);

  // Remove all existing notes (same window readClipNotes/read-clip use, so a
  // pickup before the clip start is cleared too — never orphaned outside it).
  removeAllClipNotes(clip);

  if (notes.length === 0 && muted.length === 0) {
    return 0;
  }

  // Convert musical beats back to Ableton beats, then dedupe same-pitch+start
  // collisions (keep-last) and sort ascending by start_time before adding. User
  // code returns notes in arbitrary order and may emit two notes at the same
  // pitch+onset; add_new_notes deletes an earlier same-pitch note when a
  // later-written note overlaps its onset, so an unsorted or duplicated write
  // silently drops notes. Every other write path does this (see note-sort.ts).
  const timeSigDenominator = clip.getProperty(
    "signature_denominator",
  ) as number;
  // Muted notes go under, so a user note at the same pitch+start replaces one.
  const { notes: noteEvents, collisions } = dedupeAndSortNotes(
    notes.map((note) => codeNoteToNoteEvent(note, timeSigDenominator)),
    rawNotesToCopiedNotes(muted),
  );

  clip.call("add_new_notes", { notes: noteEvents });

  return collisions;
}

/** @see getClipNoteCount - re-exported for code-exec API compatibility */
export { getClipNoteCount } from "#src/tools/shared/clip/clip-notes.ts";

// The note model, converters, and validators now live in the notation layer
// (shared with the MIDI JSON notation). Re-exported here so code-exec callers
// and tests keep importing them from this module.
export {
  codeNoteToNoteEvent,
  noteEventToCodeNote,
  validateAndSanitizeNote,
  validateCodeNotes,
} from "#src/notation/midi-json/midi-json-note.ts";
