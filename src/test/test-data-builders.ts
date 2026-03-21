// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

interface NoteOverrides {
  pitch?: number;
  start_time?: number;
  duration?: number;
  velocity?: number;
  probability?: number;
  velocity_deviation?: number;
}

interface Note {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  probability: number;
  velocity_deviation: number;
}

/**
 * Create a note object with default values for testing
 * @param overrides - Property overrides
 * @returns Note object with standard Live API note properties
 */
export const createNote = (overrides: NoteOverrides = {}): Note => ({
  pitch: 60,
  start_time: 0,
  duration: 1,
  velocity: 100,
  probability: 1.0,
  velocity_deviation: 0,
  ...overrides,
});

/**
 * Expected notes from the standard drum pattern test fixture:
 * "v100 t0.25 p1.0 C1 v80-100 p0.8 Gb1 1|1 p0.6 Gb1 1|1.5 v90 p1.0 D1 v100 p0.9 Gb1 1|2"
 * @returns Array of expected note objects
 */
export function expectedDrumPatternNotes(): Note[] {
  return [
    createNote({ pitch: 36, duration: 0.25 }),
    createNote({
      pitch: 42,
      duration: 0.25,
      velocity: 80,
      probability: 0.8,
      velocity_deviation: 20,
    }),
    createNote({
      pitch: 42,
      start_time: 0.5,
      duration: 0.25,
      velocity: 80,
      probability: 0.6,
      velocity_deviation: 20,
    }),
    createNote({ pitch: 38, start_time: 1, duration: 0.25, velocity: 90 }),
    createNote({
      pitch: 42,
      start_time: 1,
      duration: 0.25,
      probability: 0.9,
    }),
  ];
}
