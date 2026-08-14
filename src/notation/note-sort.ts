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
 * Collapse notes that share a slot ({@link isSameSlot}) down to the LAST
 * occurrence in the array.
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
      (existing) => !isSameSlot(existing, note),
    );

    withoutCollision.push(note);

    return withoutCollision;
  }, []);
}

/**
 * Prepare notes for an `add_new_notes` write: collapse same-pitch+start
 * collisions (keep-last) then sort ascending by start_time — the two steps every
 * write path must do so Live doesn't silently drop notes. Returns the collision
 * count so the caller can emit its own context-specific warning (the count is
 * relayed to the LLM). Combines {@link dedupeNotesKeepingLast} and
 * {@link sortNotes} in the required order (dedupe first, then sort).
 * @param notes - Notes in insertion order (e.g. interpreted, or existing→new)
 * @returns The write-ready notes and how many collisions were collapsed
 */
export function dedupeAndSortNotes<
  T extends { start_time: number; pitch: number },
>(notes: T[]): { notes: T[]; collisions: number } {
  const deduped = dedupeNotesKeepingLast(notes);

  return {
    notes: sortNotes(deduped),
    collisions: notes.length - deduped.length,
  };
}

/**
 * Whether two notes occupy the same slot: same pitch, same onset within
 * SAME_TIME_EPSILON (round-tripped notes drift, so onsets get a tolerance
 * instead of an equality check).
 *
 * One definition on purpose. A `v0` delete marker, the keep-last dedupe above,
 * and the repeat-collision warning must agree on what "the same note" means — if
 * they drift, a `v0` can fail to delete a note that a restated note would still
 * overwrite. Generic so it takes any note-like type.
 * @param a - A note-like object with start_time and pitch
 * @param b - The note-like object to compare it against
 * @returns True when both land on the same pitch and onset
 */
export function isSameSlot(
  a: { start_time: number; pitch: number },
  b: { start_time: number; pitch: number },
): boolean {
  return (
    a.pitch === b.pitch &&
    Math.abs(a.start_time - b.start_time) < SAME_TIME_EPSILON
  );
}
