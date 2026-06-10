// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

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

/**
 * Collapse notes that share a pitch and start_time (within SAME_TIME_EPSILON,
 * since round-tripped notes can drift) down to the LAST occurrence in the array.
 *
 * Both clip write paths need this: a transform can mutate pitch/start_time and
 * push two distinct notes onto the same pitch+exact-onset, which Live's
 * add_new_notes resolves by deleting the earlier write — non-deterministic data
 * loss. Deduping keep-last makes the resolution explicit and order-independent.
 * Sorting alone only saves tail overlaps, not exact collisions. Pair with
 * {@link sortNotes} (dedupe first, then sort).
 * @param notes - Notes in insertion order (e.g. existing→new, or pre-transform)
 * @returns Notes with same-pitch+start collisions collapsed to the last write
 */
export function dedupeNotesKeepingLast<
  T extends { start_time: number; pitch: number },
>(notes: T[]): T[] {
  return notes.reduce<T[]>((result, note) => {
    const withoutCollision = result.filter(
      (existing) =>
        existing.pitch !== note.pitch ||
        Math.abs(existing.start_time - note.start_time) >= SAME_TIME_EPSILON,
    );

    withoutCollision.push(note);

    return withoutCollision;
  }, []);
}
