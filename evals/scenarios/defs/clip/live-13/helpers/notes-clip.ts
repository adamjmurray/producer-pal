// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type NoteEvent } from "#src/notation/types.ts";

/** C1: what the Notes clip in the Live 13 test Set holds. */
const C1 = 36;

/** Beats it plays them on. */
const BEATS = [0, 1, 2, 3];

/**
 * What is wrong with the test Set's Notes clip, which should still hold C1 on
 * beats 1 to 4 and nothing else.
 *
 * @param notes - The clip's notes
 * @returns A description of what is wrong, or null when it is untouched
 */
export function notesClipProblem(notes: NoteEvent[]): string | null {
  const starts = notes.map((note) => note.start_time).toSorted((a, b) => a - b);

  if (notes.some((note) => note.pitch !== C1)) {
    return `Notes clip holds pitches ${notes.map((note) => note.pitch).join(", ")}, wanted only ${C1}`;
  }

  return starts.join(",") === BEATS.join(",")
    ? null
    : `Notes clip has notes at beats ${starts.join(", ")}, wanted ${BEATS.join(", ")}`;
}
