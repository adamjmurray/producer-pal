// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
  return notes.toSorted((a, b) => {
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
  const replaced = findReplacedIndices(notes);

  return notes.filter((_, index) => !replaced.has(index));
}

/**
 * Indices of notes with a later note in their slot. A note survives keep-last
 * only if none follows it, so this is the whole rule, not a shortcut: the
 * tolerance isn't transitive, but a note removed early is always removed by a
 * later one too.
 *
 * Per pitch, sort by onset; the notes within the tolerance of one are a
 * contiguous window. A sliding-window maximum of the original index says whether
 * any note in it comes later. O(n log n), versus re-filtering per note.
 * Non-finite onsets and NaN pitches never share a slot ({@link isSameSlot}), so
 * they stay out.
 * @param notes - Notes in insertion order
 * @returns The indices to drop
 */
function findReplacedIndices(
  notes: { start_time: number; pitch: number }[],
): Set<number> {
  const byPitch = new Map<number, number[]>();

  for (const [index, note] of notes.entries()) {
    if (Number.isNaN(note.pitch) || !Number.isFinite(note.start_time)) {
      continue;
    }

    const group = byPitch.get(note.pitch);

    if (group == null) {
      byPitch.set(note.pitch, [index]);
    } else {
      group.push(index);
    }
  }

  const replaced = new Set<number>();

  for (const group of byPitch.values()) {
    markReplacedInGroup(notes, group, replaced);
  }

  return replaced;
}

/**
 * Slide a window over one pitch's notes in onset order, tracking the highest
 * original index in it.
 * @param notes - All notes in insertion order
 * @param group - Indices of the notes sharing one pitch
 * @param replaced - Collects the indices that have a later note in their slot
 */
function markReplacedInGroup(
  notes: { start_time: number }[],
  group: number[],
  replaced: Set<number>,
): void {
  if (group.length < 2) {
    return;
  }

  const time = (note: number): number =>
    (notes[note] as { start_time: number }).start_time;
  const order = group.toSorted((a, b) => time(a) - time(b));
  // Positions in `order`, from `head` on, with original indices falling
  const maxima: number[] = [];
  let head = 0;
  let lo = 0;
  let hi = 0;

  for (let pos = 0; pos < order.length; pos++) {
    const here = time(order[pos] as number);

    while (
      hi < order.length &&
      isWithinEpsilon(time(order[hi] as number), here)
    ) {
      while (
        maxima.length > head &&
        (order[maxima.at(-1) as number] as number) < (order[hi] as number)
      ) {
        maxima.pop();
      }

      maxima.push(hi++);
    }

    while (!isWithinEpsilon(time(order[lo] as number), here)) {
      lo++;
    }

    while ((maxima[head] as number) < lo) {
      head++;
    }

    if ((order[maxima[head] as number] as number) > (order[pos] as number)) {
      replaced.add(order[pos] as number);
    }
  }
}

/**
 * How many notes {@link dedupeNotesKeepingLast} would drop: the ones that share
 * a slot with a later note.
 * @param notes - Notes in insertion order
 * @returns The number of same-pitch+start duplicates among them
 */
export function countSlotCollisions(
  notes: { start_time: number; pitch: number }[],
): number {
  return notes.length - dedupeNotesKeepingLast(notes).length;
}

/**
 * Prepare notes for an `add_new_notes` write: collapse same-pitch+start
 * collisions (keep-last) then sort ascending by start_time — the two steps every
 * write path must do so Live doesn't silently drop notes. Returns the collision
 * count so the caller can emit its own context-specific warning (the count is
 * relayed to the LLM). Combines {@link dedupeNotesKeepingLast} and
 * {@link sortNotes} in the required order (dedupe first, then sort).
 * @param notes - Notes in insertion order (e.g. interpreted, or existing→new)
 * @param kept - Notes written under `notes` (muted ones): any of them at the
 * same slot is replaced, and that doesn't count as a collision
 * @returns The write-ready notes and how many collisions were collapsed
 */
export function dedupeAndSortNotes<
  T extends { start_time: number; pitch: number },
>(notes: T[], kept: T[] = []): { notes: T[]; collisions: number } {
  const deduped = dedupeNotesKeepingLast(notes);

  return {
    notes: sortNotes(
      kept.length > 0 ? dedupeNotesKeepingLast([...kept, ...deduped]) : deduped,
    ),
    collisions: notes.length - deduped.length,
  };
}

/**
 * Whether two notes occupy the same slot: same pitch, same onset within
 * SAME_TIME_EPSILON (round-tripped notes drift, so onsets get a tolerance
 * instead of an equality check).
 *
 * One definition on purpose. A `v0` delete marker and the keep-last dedupe above
 * must agree on what "the same note" means — if they drift, a `v0` can fail to
 * delete a note that a restated note would still overwrite. Generic so it takes
 * any note-like type.
 * @param a - A note-like object with start_time and pitch
 * @param b - The note-like object to compare it against
 * @returns True when both land on the same pitch and onset
 */
export function isSameSlot(
  a: { start_time: number; pitch: number },
  b: { start_time: number; pitch: number },
): boolean {
  return a.pitch === b.pitch && isWithinEpsilon(a.start_time, b.start_time);
}

function isWithinEpsilon(a: number, b: number): boolean {
  return Math.abs(a - b) < SAME_TIME_EPSILON;
}
