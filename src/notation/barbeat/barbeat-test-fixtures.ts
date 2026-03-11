// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { createNote } from "#src/test/test-data-builders.ts";

/**
 * Drum pattern notes used across barbeat format/interpret round-trip tests.
 * Contains kick (C1), hihat (Gb1) with velocity/probability, and snare (D1).
 */
export const drumPatternNotes: NoteEvent[] = [
  createNote({ pitch: 36, duration: 0.25 }), // C1 (kick)
  createNote({
    pitch: 42,
    duration: 0.25,
    velocity: 80,
    probability: 0.8,
    velocity_deviation: 20,
  }), // Gb1 (hihat)
  createNote({
    pitch: 42,
    start_time: 0.5,
    duration: 0.25,
    velocity: 80,
    probability: 0.6,
    velocity_deviation: 20,
  }), // Gb1 (hihat)
  createNote({ pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }), // D1 (snare)
  createNote({
    pitch: 42,
    start_time: 1,
    duration: 0.25,
    probability: 0.9,
  }), // Gb1 (hihat)
] as NoteEvent[];

export const drumPatternNotation =
  "t/4 C1 v80-100 p0.8 Gb1 1|1 p0.6 Gb1 1|1.5 v90 p1 D1 v100 p0.9 Gb1 1|2";

/**
 * Sort notes by start_time (with epsilon tolerance), then pitch for comparison.
 * Uses epsilon comparison for floating-point start_time to handle fraction drift.
 * @param notes - Notes to sort
 * @returns Sorted copy
 */
export function sortNotes(notes: NoteEvent[]): NoteEvent[] {
  return [...notes].sort((a, b) => {
    if (Math.abs(a.start_time - b.start_time) > 0.001)
      return a.start_time - b.start_time;

    return a.pitch - b.pitch;
  });
}
