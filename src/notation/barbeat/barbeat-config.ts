// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export const DEFAULT_VELOCITY = 100;
export const DEFAULT_TIME: { bar: number; beat: number } = { bar: 1, beat: 1 };
export const DEFAULT_BEATS_PER_BAR = 4;
export const DEFAULT_PROBABILITY = 1.0;
export const DEFAULT_VELOCITY_DEVIATION = 0;

/**
 * Default `t` duration as a fraction of a whole note (quarter note = 1/4).
 * Under the absolute-note-value semantics, the default is always a quarter
 * note regardless of meter.
 */
export const DEFAULT_DURATION_WHOLE_NOTE_FRACTION = 1 / 4;

/**
 * Default duration in musical beats for a given time signature.
 * A quarter note in N/D meter is D/4 musical beats: 1 in 4/4, 2 in 6/8, 0.5 in 2/2.
 * @param timeSigDenominator - Time signature denominator (defaults to 4)
 * @returns Default duration expressed in musical beats
 */
export function defaultDurationMusicalBeats(
  timeSigDenominator: number | undefined,
): number {
  return DEFAULT_DURATION_WHOLE_NOTE_FRACTION * (timeSigDenominator ?? 4);
}

/**
 * Convert an absolute duration/step (fraction of a whole note) to musical beats.
 * 1 whole note = D musical beats in N/D meter.
 * @param wholeNoteFraction - Value as a fraction of a whole note (e.g., 1/4 = quarter)
 * @param timeSigDenominator - Time signature denominator (defaults to 4)
 * @returns Value expressed in musical beats
 */
export function wholeNoteFractionToMusicalBeats(
  wholeNoteFraction: number,
  timeSigDenominator: number | undefined,
): number {
  return wholeNoteFraction * (timeSigDenominator ?? 4);
}

/**
 * Convert musical beats to a fraction of a whole note.
 * @param musicalBeats - Value in musical beats
 * @param timeSigDenominator - Time signature denominator (defaults to 4)
 * @returns Value as a fraction of a whole note
 */
export function musicalBeatsToWholeNoteFraction(
  musicalBeats: number,
  timeSigDenominator: number | undefined,
): number {
  return musicalBeats / (timeSigDenominator ?? 4);
}
