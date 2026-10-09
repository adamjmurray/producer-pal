// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type NoteEvent } from "#src/notation/types.ts";

/** For each note an op made, the matched notes it came from */
export type NoteParents = Map<NoteEvent, readonly NoteEvent[]>;

/** What a note-count op (ratchet/repeat/split/merge) did to its matched notes */
export interface NoteOpResult {
  /** The matched notes after the op (originals kept, plus any it made) */
  notes: NoteEvent[];
  /** True when the op bailed out (bad args) and left the notes untouched */
  skipped: boolean;
  /** Where each note the op made came from, so a count can follow a note through it */
  parents: NoteParents;
}

/**
 * Record that notes were made from others.
 * @param parents - The op's record of where its notes came from, added to
 * @param from - The matched note, or notes, the new ones came from
 * @param made - The new notes
 * @returns The new notes, for pushing straight onto the op's output
 */
export function madeFrom(
  parents: NoteParents,
  from: NoteEvent | readonly NoteEvent[],
  made: NoteEvent[],
): NoteEvent[] {
  const sources = Array.isArray(from) ? from : [from as NoteEvent];

  for (const note of made) {
    parents.set(note, sources);
  }

  return made;
}

/**
 * Result for an op that bailed out and left its matched notes as they were.
 * @param matched - The notes the op was given
 * @returns A skipped result carrying the notes unchanged
 */
export function skippedNoteOp(matched: NoteEvent[]): NoteOpResult {
  return { notes: matched, skipped: true, parents: new Map() };
}
