// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { type NoteEvent } from "./types.ts";

/**
 * Apply v0 (velocity 0) deletions to notes in serial order.
 * For each v0 note encountered, removes all previously-processed notes
 * that match its pitch and start_time, then removes the v0 note itself.
 *
 * Notation-agnostic: bar|beat's inline `v0` and MIDI JSON's `v:0` both land here
 * as a velocity-0 NoteEvent. This is the central place where v0 notes are
 * filtered out before sending to the Live API (which cannot handle velocity 0).
 * @param notes - Notes including v0 notes
 * @returns Notes with v0 deletions applied (v0 notes filtered out)
 */
export function applyV0Deletions(notes: NoteEvent[]): NoteEvent[] {
  let result: NoteEvent[] = [];

  for (const note of notes) {
    if (note.velocity === 0) {
      // v0 note - drop matching notes from the results so far, and itself
      result = result.filter(
        (existingNote) =>
          existingNote.pitch !== note.pitch ||
          Math.abs(existingNote.start_time - note.start_time) >=
            SAME_TIME_EPSILON,
      );
      continue;
    }

    result.push(note);
  }

  return result;
}
