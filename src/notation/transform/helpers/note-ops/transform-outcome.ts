// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { type TransformOutcome } from "../../transformed-count.ts";

const NOTE_VALUES = [
  "pitch",
  "start_time",
  "duration",
  "velocity",
  "probability",
  "velocity_deviation",
] as const;

/**
 * Whether two notes hold the same values. Live keeps 32-bit floats, so a value
 * read back as 0.800000011920929 is the 0.8 a transform writes.
 * @param a - A note
 * @param b - The note to compare it with
 * @returns True when no value differs at 32-bit resolution
 */
export function sameNoteValues(a: NoteEvent, b: NoteEvent): boolean {
  return NOTE_VALUES.every((key) => {
    const [x, y] = [a[key], b[key]];

    return (
      x === y || (x != null && y != null && Math.fround(x) === Math.fround(y))
    );
  });
}

/**
 * Work out what a transform did, from the notes it started with and the ones
 * left. Notes are followed by object, so this survives note-count ops:
 * - A note that is still there counts as changed only if its values differ.
 * - A note an op made counts as changed unless it equals a note it came from
 *   (a merge swallowing a shorter note leaves the longer one as it was).
 * - A note is deleted when its place is gone: driven to 0, or merged into
 *   another. A merge keeps one note of the group, so it deletes the rest.
 *   Notes an op made are never counted; only the ones the clip held.
 * @param original - Each starting note's values, by note
 * @param roots - For each note an op made, the starting notes it came from
 * @param touched - The notes the transform selected or made
 * @param left - The notes left after the transform
 * @returns What changed and what was deleted
 */
export function buildOutcome(
  original: ReadonlyMap<NoteEvent, NoteEvent>,
  roots: ReadonlyMap<NoteEvent, ReadonlySet<NoteEvent>>,
  touched: ReadonlySet<NoteEvent>,
  left: readonly NoteEvent[],
): TransformOutcome {
  const rootsOf = (note: NoteEvent): Iterable<NoteEvent> =>
    roots.get(note) ?? (original.has(note) ? [note] : []);

  // Starting notes a merge joined belong to one group, which keeps one note.
  const groups = new Map<NoteEvent, Set<NoteEvent>>();

  for (const note of original.keys()) {
    groups.set(note, new Set([note]));
  }

  for (const set of roots.values()) {
    joinGroups(groups, [...set]);
  }

  const alive = new Set<Set<NoteEvent>>();

  for (const note of left) {
    for (const root of rootsOf(note)) {
      alive.add(groups.get(root) as Set<NoteEvent>);
    }
  }

  const changed = new Set<NoteEvent>();

  for (const note of left) {
    if (touched.has(note) && isChanged(note, original, rootsOf(note))) {
      changed.add(note);
    }
  }

  return {
    changed,
    deleted: removedNotes(groups, alive, left, original),
    original,
  };
}

/**
 * Join the groups of notes that a merge made one.
 * @param groups - Each starting note's group; joined in place
 * @param members - Starting notes that now share a group
 */
function joinGroups(
  groups: Map<NoteEvent, Set<NoteEvent>>,
  members: NoteEvent[],
): void {
  const [head, ...rest] = members;
  const target = groups.get(head as NoteEvent);

  for (const member of rest) {
    const group = groups.get(member);

    if (target != null && group != null && group !== target) {
      for (const other of group) {
        target.add(other);
        groups.set(other, target);
      }
    }
  }
}

/**
 * @param note - A selected note that is still there
 * @param original - Each starting note's values, by note
 * @param roots - The starting notes it came from
 * @returns True when its values differ from where it started
 */
function isChanged(
  note: NoteEvent,
  original: ReadonlyMap<NoteEvent, NoteEvent>,
  roots: Iterable<NoteEvent>,
): boolean {
  const own = original.get(note);

  if (own != null) {
    return !sameNoteValues(note, own);
  }

  return ![...roots].some((root) => {
    const start = original.get(root);

    return start != null && sameNoteValues(note, start);
  });
}

/**
 * The starting notes the transform removed, as they started.
 * @param groups - Each starting note's group
 * @param alive - The groups that still have a note in the clip
 * @param left - The notes left after the transform
 * @param original - Each starting note's values, by note
 * @returns One entry per removed note
 */
function removedNotes(
  groups: ReadonlyMap<NoteEvent, Set<NoteEvent>>,
  alive: ReadonlySet<Set<NoteEvent>>,
  left: readonly NoteEvent[],
  original: ReadonlyMap<NoteEvent, NoteEvent>,
): NoteEvent[] {
  const removed: NoteEvent[] = [];

  for (const group of new Set(groups.values())) {
    // A group that is still there keeps one note: the one a note left equals,
    // or else its first.
    const members = [...group];
    const keep = !alive.has(group)
      ? undefined
      : members.length === 1
        ? members[0]
        : (members.find((member) =>
            left.some((note) =>
              sameNoteValues(note, original.get(member) as NoteEvent),
            ),
          ) ?? members[0]);

    for (const member of members) {
      if (member !== keep) {
        removed.push(original.get(member) as NoteEvent);
      }
    }
  }

  return removed;
}
