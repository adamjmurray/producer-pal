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
