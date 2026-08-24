// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import {
  createNote,
  expectedDrumPatternNotes,
} from "#src/test/test-data-builders.ts";

/**
 * Drum pattern notes used across barbeat format/interpret round-trip tests.
 * Contains kick (C1), hihat (Gb1) with velocity/probability, and snare (D1).
 */
export const drumPatternNotes = expectedDrumPatternNotes() as NoteEvent[];

export const drumPatternNotation =
  "v100 n/16 C1 v80-100 p0.8 Gb1 1|1\np0.6 Gb1 1|1.5\nv90 p1 D1 v100 p0.9 Gb1 1|2";

/**
 * A simple kick (C1) / snare (D1) drum pattern: kicks on beats 1 and 3, snares
 * on beats 2 and 4. Returned as a fresh array so callers can mutate freely.
 * @returns Kick/snare NoteEvent array
 */
export function kickSnareNotes(): NoteEvent[] {
  return [
    createNote({ pitch: 36, start_time: 0, duration: 0.25 }),
    createNote({ pitch: 36, start_time: 2, duration: 0.25 }),
    createNote({ pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }),
    createNote({ pitch: 38, start_time: 3, duration: 0.25, velocity: 90 }),
  ] as NoteEvent[];
}

/**
 * Sort notes by start_time (with epsilon tolerance), then pitch for comparison.
 * Uses epsilon comparison for floating-point start_time to handle fraction drift.
 * @param notes - Notes to sort
 * @returns Sorted copy
 */
export function sortNotes(notes: NoteEvent[]): NoteEvent[] {
  return notes.toSorted((a, b) => {
    if (Math.abs(a.start_time - b.start_time) > SAME_TIME_EPSILON)
      return a.start_time - b.start_time;

    return a.pitch - b.pitch;
  });
}
