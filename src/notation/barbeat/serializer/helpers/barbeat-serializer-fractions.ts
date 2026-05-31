// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  musicalBeatsToWholeNoteFraction,
  NOTE_VALUE_DENOMINATORS,
} from "#src/notation/barbeat/barbeat-config.ts";

/**
 * Tolerance for matching a value to a clean note-value fraction (on the scaled
 * numerator). Genuine note values reach the serializer as full-precision doubles:
 * verified against Ableton Live that an authored 1/3 eighth-triplet AND a note
 * quantized to a 1/8T grid both read back as 0.3333333333333333 (residual ~1e-15)
 * — Live never coarsely rounds note times. So this tolerance sits far above that
 * float noise yet far below the ~1e-4 grid of authored note values: a genuinely
 * off-grid value is sent to the lossless decimal-numerator escape rather than
 * snapped to a near-by note value, while every real tuplet still matches. The
 * residual snap drift is ≤~4e-6 Ableton beats, below the escape's own toFixed(4)
 * precision — so the serializer no longer silently rounds to a wrong note value.
 */
const EPSILON = 1e-6;

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
    // form the parser round-trips. A clean tuplet/dyadic offset is exact; a
    // genuinely off-grid sub-1 position falls through to formatAbsoluteDuration's
    // decimal-numerator escape (`1-n0.7/4`), which the `±n`-offset grammars now
    // accept — so it round-trips losslessly too, with no bare-sub-1-decimal gap.
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

  // Genuinely off-grid (no clean note-value at a beat-offset denominator). A
  // 3-decimal grid beat is shorter and readable when it round-trips exactly, so
  // keep it for those; otherwise the decimal would silently drift (e.g. 2.9877 →
  // "2.988" reparses to 2.988), so spell it with the lossless `base+n<beats>/4`
  // decimal-numerator escape — the same form the sub-1 (negative) branch uses.
  // The `+n` offset grammar accepts the decimal numerator, so it round-trips
  // exactly. (formatAbsoluteDuration tries the full note-value denominator set
  // before that escape, so a clean tuplet beyond the beat-offset set spells
  // exactly too.)
  if (offsetFraction == null) {
    return decimalIsLossless(value)
      ? formatDecimal(value)
      : `${base}+n${formatAbsoluteDuration(wholeNoteFraction)}`;
  }

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
 * a sixteenth-of-a-beat is a 1/64 offset). A subset of the canonical
 * `NOTE_VALUE_DENOMINATORS` (barbeat-config.ts), locked by
 * `note-value-denominator-parity.test.ts`.
 */
export const BEAT_OFFSET_DENOMINATORS = [
  2, 4, 8, 16, 32, 64, 3, 6, 12, 24, 48, 96, 5, 10, 20, 40,
];

/**
 * Format an absolute duration/step value as a `<num>/<den>` fraction of a whole
 * note. Used for `n` durations and `@step` intervals in bar|beat notation. Emits
 * the clean note-value fraction (numerator omitted when 1) when one exists, or
 * the lossless decimal-numerator off-grid escape `<beats>/4` for a genuinely
 * off-grid (sample-derived) value.
 * @param wholeNoteFraction - Value as a fraction of a whole note (e.g., 1/4 = quarter)
 * @returns Formatted value string (e.g., "/4", "3/8", "/12", "5/4", "1.9638/4")
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

  // Fallback: a genuinely off-grid value (no exact note-value fraction at any
  // canonical denominator — only ever produced by *measuring* a sample-derived
  // length, never by authoring). Spell it losslessly with the decimal-numerator
  // escape `<beats>/4` (the caller prepends `n`, giving `n<beats>/4`): the `/4`
  // denominator makes the numerator read as Ableton beats, so the value is
  // `wholeNoteFraction * 4` quarters. The note/`@step`/`±n`-offset grammars all
  // accept this escape (locked by note-value-grammar-parity.test.ts) — it is the
  // same form abletonBeatsToDuration emits for off-grid lengths, fixed precision.
  // (The escape itself never rounds; only the EPSILON match in the loop above can
  // snap a near-miss off-grid value to a clean note value — see EPSILON.)
  return `${formatOffGridBeats(wholeNoteFraction * 4)}/4`;
}

/**
 * Denominators tried (preference order) when reducing an absolute duration to a
 * fraction. Durations may spell every representable note value, so this is the
 * full canonical set (single source of truth in `barbeat-config.ts`); the prior
 * hand-maintained subset omitted 64/128/256/48/96/40/7/14, silently snapping
 * those note values to the lossy /64 fallback on read → re-author.
 */
const ABSOLUTE_DURATION_DENOMINATORS = NOTE_VALUE_DENOMINATORS;

/**
 * Format an off-grid value as the decimal numerator of an `n<beats>/4` note
 * value: fixed 4-place precision with trailing zeros (and a bare trailing dot)
 * stripped; integers render without a decimal. Shared by both off-grid escapes —
 * `formatAbsoluteDuration` (durations/`@step`/sub-1 offsets) here and
 * `abletonBeatsToDuration` (lengths) in barbeat-time.ts — so the two stay
 * byte-identical.
 * @param beats - Value in Ableton beats (quarter notes)
 * @returns Numerator string (e.g. "1.9638", "2")
 */
export function formatOffGridBeats(beats: number): string {
  if (Number.isInteger(beats)) {
    return beats.toString();
  }

  return beats.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * Check if a value can be represented losslessly with 3 decimal places — the
 * gate {@link formatBeatPosition} uses to prefer the shorter decimal spelling
 * (`1.5`) over the note-value offset form. It is purely a representation choice,
 * not a precision trade-off: when it returns false the caller falls back to an
 * exact note-value offset (`base+n<fraction>`) or the decimal-numerator escape
 * (`base+n<beats>/4`), so a position never drifts — the decimal is emitted only
 * when it round-trips exactly.
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
