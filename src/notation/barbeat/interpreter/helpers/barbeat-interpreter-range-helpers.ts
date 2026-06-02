// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";

const MIDI_MIN = 0;
const MIDI_MAX = 127;

/**
 * Clamp a velocity (or velocity-range bound) into the valid MIDI range,
 * warning when a value is out of range. Recoverable: a single out-of-range
 * velocity no longer aborts the whole clip's notation.
 * @param value - Raw velocity value from the parser
 * @param label - What is being clamped (for the warning, e.g. "velocity")
 * @returns Velocity clamped to 0-127
 */
export function clampVelocity(value: number, label: string): number {
  if (value < MIDI_MIN || value > MIDI_MAX) {
    const clamped = Math.max(MIDI_MIN, Math.min(MIDI_MAX, value));

    console.warn(
      `${label} ${value} outside valid range ${MIDI_MIN}-${MIDI_MAX}; clamped to ${clamped}`,
    );

    return clamped;
  }

  return value;
}

/**
 * Clamp a probability into 0.0-1.0, warning when out of range.
 * @param value - Raw probability value from the parser
 * @returns Probability clamped to 0.0-1.0
 */
export function clampProbability(value: number): number {
  if (value < 0 || value > 1) {
    const clamped = Math.max(0, Math.min(1, value));

    console.warn(
      `probability ${value} outside valid range 0.0-1.0; clamped to ${clamped}`,
    );

    return clamped;
  }

  return value;
}

/**
 * Check whether a MIDI pitch is in range, warning and returning false when it
 * is not. Out-of-range pitch is skipped (not clamped) — fabricating a nearby
 * pitch for a typo would invent music; dropping the note is more honest.
 * @param pitch - MIDI pitch from the parser
 * @returns True if the pitch is in 0-127 and the note should be emitted
 */
export function acceptPitch(pitch: number): boolean {
  if (pitch < MIDI_MIN || pitch > MIDI_MAX) {
    console.warn(
      `MIDI pitch ${pitch} outside valid range ${MIDI_MIN}-${MIDI_MAX}; note skipped`,
    );

    return false;
  }

  return true;
}
