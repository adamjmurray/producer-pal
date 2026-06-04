// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Sort notes ascending by start_time, with pitch as a stable tiebreaker.
 *
 * This ordering is an invariant for every `add_new_notes` write: Live deletes an
 * earlier same-pitch note when a later-written note overlaps its onset, so
 * writing notes out of order can silently drop notes. Ascending-by-start order
 * leaves only tail overlaps, which Live resolves by truncation — both notes
 * survive. Generic so it preserves the caller's note type (NoteEvent, MidiNote).
 * @param notes - Note-like objects with start_time and pitch
 * @returns A new sorted array (the input is not mutated)
 */
export function sortNotes<T extends { start_time: number; pitch: number }>(
  notes: T[],
): T[] {
  return [...notes].sort((a, b) => {
    if (a.start_time !== b.start_time) {
      return a.start_time - b.start_time;
    }

    return a.pitch - b.pitch;
  });
}
