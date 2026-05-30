// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { musicalBeatsToWholeNoteFraction } from "#src/notation/barbeat/barbeat-config.ts";

/** Tolerance for floating-point fraction matching */
const EPSILON = 0.0005;

/**
 * Format a beat position value as a grid beat with an optional note-value
 * offset. Dyadic sub-beats use a plain decimal (`1.5`); non-dyadic (tuplet)
 * positions use a `base+n<fraction>` offset (`1+n/12` = beat 1 + an eighth
 * triplet), where the fraction is whole-note based — the same `n` grammar as
 * durations. Falls back to a decimal for genuinely off-grid values. A beat
 * below the downbeat (value < 1, a note before the clip start / negative time)
 * is emitted as beat 1 minus an offset (`1-n/12`), since the grammar has no
 * bare sub-1 beat.
 * @param value - Beat position value
 * @param timeSigDenominator - Time signature denominator (for the offset unit)
 * @returns Formatted beat position string
 */
export function formatBeatPosition(
  value: number,
  timeSigDenominator: number | undefined,
): string {
  if (value < 1) {
    // A beat below the downbeat (negative time, a note before the clip start)
    // can't be a bare sub-1 beat — the grammar requires a 1-based grid beat.
    // Express it as beat 1 minus a note-value offset (`1-n/12`), the authoring
    // form the parser round-trips.
    const offsetBeats = 1 - value; // musical beats below the downbeat
    const wholeNoteFraction = musicalBeatsToWholeNoteFraction(
      offsetBeats,
      timeSigDenominator,
    );
    const offsetFraction =
      formatBeatOffsetFraction(wholeNoteFraction) ??
      formatAbsoluteDuration(wholeNoteFraction);

    return `1-n${offsetFraction}`;
  }

  if (value % 1 === 0) return value.toString();

  const base = Math.floor(value);
  const fracBeats = value - base;
  const wholeNoteFraction = musicalBeatsToWholeNoteFraction(
    fracBeats,
    timeSigDenominator,
  );
  const offsetFraction = formatBeatOffsetFraction(wholeNoteFraction);

  // Genuinely off-grid (no clean note-value): decimal is the only honest form.
  if (offsetFraction == null) return formatDecimal(value);

  // Dyadic sub-beats round-trip exactly as a decimal, which is always shorter
  // than (and more readable than) the offset form — prefer it. Tuplet positions
  // have lossy decimals, so they fall through to the note-value offset.
  if (decimalIsLossless(value)) return formatDecimal(value);

  return `${base}+n${offsetFraction}`;
}

/**
 * Reduce a whole-note fraction to a `<num>/<den>` string for a beat offset
 * (numerator omitted when 1, e.g. `/12`), or null when no clean note-value
 * denominator matches (genuinely off-grid). A beat offset is a whole-note
 * fraction, so its denominators run finer than a duration's: a 1/16-beat is a
 * 1/64-note offset. Powers of two first, then triplet then quintuplet families.
 * @param wholeNoteFraction - Offset as a fraction of a whole note
 * @returns Fraction string (e.g. "/12", "3/64") or null when off-grid
 */
function formatBeatOffsetFraction(wholeNoteFraction: number): string | null {
  for (const den of BEAT_OFFSET_DENOMINATORS) {
    const num = wholeNoteFraction * den;

    if (Math.abs(num - Math.round(num)) < EPSILON && Math.round(num) > 0) {
      const numRounded = Math.round(num);

      return numRounded === 1 ? `/${den}` : `${numRounded}/${den}`;
    }
  }

  return null;
}

/**
 * Denominators tried when reducing a beat offset to a note-value fraction.
 * Finer than the duration set because the offset is a whole-note fraction of a
 * sub-beat displacement (e.g. an eighth-triplet beat position is a 1/12 offset,
 * a sixteenth-of-a-beat is a 1/64 offset).
 */
const BEAT_OFFSET_DENOMINATORS = [
  2, 4, 8, 16, 32, 64, 3, 6, 12, 24, 48, 96, 5, 10, 20, 40,
];

/**
 * Format an absolute duration/step value as a `<num>/<den>` fraction of a whole note.
 * Used for `n` durations and `@step` intervals in bar|beat notation.
 * Always emits the fraction form (numerator omitted when 1).
 * @param wholeNoteFraction - Value as a fraction of a whole note (e.g., 1/4 = quarter)
 * @returns Formatted value string (e.g., "/4", "3/8", "/12", "5/4")
 */
export function formatAbsoluteDuration(wholeNoteFraction: number): string {
  if (wholeNoteFraction === 0) return "0/1";

  // Try musically clean denominators first (powers of 2), then triplet family,
  // then less common tuplets. Smallest matching denominator wins.
  for (const den of ABSOLUTE_DURATION_DENOMINATORS) {
    const num = wholeNoteFraction * den;

    if (Math.abs(num - Math.round(num)) < EPSILON && Math.round(num) > 0) {
      const numRounded = Math.round(num);

      return numRounded === 1 ? `/${den}` : `${numRounded}/${den}`;
    }
  }

  // Fallback: any value we couldn't reduce to a clean fraction (unusual).
  // Use a high-resolution denominator and accept slight rounding.
  const fallbackDen = 64;
  const fallbackNum = Math.max(1, Math.round(wholeNoteFraction * fallbackDen));

  return fallbackNum === 1
    ? `/${fallbackDen}`
    : `${fallbackNum}/${fallbackDen}`;
}

/**
 * Denominators tried when reducing an absolute duration to a fraction.
 * Order: powers of 2 (most common note values), triplets, then quintuplets.
 */
const ABSOLUTE_DURATION_DENOMINATORS = [
  1, 2, 4, 8, 16, 32, 3, 6, 12, 24, 5, 10, 20,
];

/**
 * Check if a value can be represented losslessly with 3 decimal places.
 * @param value - Original numeric value
 * @returns True if toFixed(3) preserves the value exactly
 */
function decimalIsLossless(value: number): boolean {
  const scaled = value * 1000;

  return Math.abs(scaled - Math.round(scaled)) < 0.01;
}

/**
 * Format a number as decimal, removing trailing zeros.
 * @param value - Number to format
 * @returns Formatted decimal string
 */
export function formatDecimal(value: number): string {
  return value % 1 === 0
    ? value.toString()
    : value.toFixed(3).replace(/\.?0+$/, "");
}
