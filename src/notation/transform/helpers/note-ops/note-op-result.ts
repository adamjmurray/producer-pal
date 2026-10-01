// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";

/** What a note-count op (ratchet/repeat/split/merge) did to its matched notes */
export interface NoteOpResult {
  /** The matched notes after the op (originals kept, plus any it made) */
  notes: NoteEvent[];
  /** True when the op bailed out (bad args) and left the notes untouched */
  skipped: boolean;
}

/**
 * Result for an op that bailed out and left its matched notes as they were.
 * @param matched - The notes the op was given
 * @returns A skipped result carrying the notes unchanged
 */
export function skippedNoteOp(matched: NoteEvent[]): NoteOpResult {
  return { notes: matched, skipped: true };
}
