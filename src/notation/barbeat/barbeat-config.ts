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
 * Default `n` duration as a fraction of a whole note (quarter note = 1/4).
 * Under the absolute-note-value semantics, the default is always a quarter
 * note regardless of meter.
 */
export const DEFAULT_DURATION_WHOLE_NOTE_FRACTION = 1 / 4;

/**
 * The single canonical set of note-value denominators the serializers may emit,
 * ordered by preference: binary (powers of two, smallest denominator first
 * within the family, so the simplest matching note value wins), then the
 * triplet/sextuplet family, then quintuplets, then septuplets. Every
 * denominator here produces a grammar-valid `n<num>/<den>` token (both Peggy
 * grammars accept any `[1-9][0-9]*` denominator).
 *
 * The per-surface denominator lists (`ABSOLUTE_DURATION_DENOMINATORS` for note
 * durations / `@step`, `DURATION_DENOMINATOR_CANDIDATES` for length read-backs,
 * `BEAT_OFFSET_DENOMINATORS` for position offsets) are all subsets of this set —
 * they differ only in which families/fineness each surface emits, never in what
 * is representable. `note-value-denominator-parity.test.ts` locks that invariant
 * so the lists cannot silently drift apart again (the divergence that let note
 * durations like `n/128` round-trip-corrupt to `n/64`).
 */
export const NOTE_VALUE_DENOMINATORS = [
  1, 2, 4, 8, 16, 32, 64, 128, 256, 3, 6, 12, 24, 48, 96, 5, 10, 20, 40, 7, 14,
];

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

/**
 * Base denominators (powers of two) the read-back serializers may sugar with a
 * dotted (`d`) or triplet (`t`) suffix: `/1d` (dotted whole) … `/64d`, `/1t` …
 * `/64t`. Finer values fall through to their plain fraction — a dotted or triplet
 * note value below a 64th is unheard-of.
 */
const MODIFIER_NOTE_VALUE_DENOMINATORS = [1, 2, 4, 8, 16, 32, 64];

/**
 * Match tolerance for read-back dotted/triplet detection. Genuine dotted/triplet
 * note values reach the serializer as full-precision doubles (residual ~1e-15),
 * while the nearest non-matching note value is >~1e-3 away, so a tight 1e-9 catches
 * every real one and can never hijack a plain value.
 */
const MODIFIER_EPSILON = 1e-9;

/**
 * If `wholeNoteFraction` is exactly an implicit-numerator dotted (`3/2N`) or
 * triplet (`2/3N`) note value with a power-of-two base denominator N, return its
 * sugared spelling — `/4d` (dotted quarter = 3/8), `/8t` (eighth triplet = 1/12) —
 * else null. Read-back sugar for durations/lengths/`@step`: the serializers try
 * this before the plain fraction reduction so a dotted quarter emits `n/4d` rather
 * than `n3/8`. Only implicit-numerator forms are emitted (never `n3/8d`); a value
 * with no power-of-two base (e.g. 9/16, the `n3/8d` input) round-trips through its
 * plain fraction. Dotted (numerator 3) and triplet (a factor of 3 in the
 * denominator) families never overlap each other, nor any plain `1/2^m` note value.
 * @param wholeNoteFraction - Value as a fraction of a whole note
 * @returns Sugared note-value fraction (`/4d`, `/8t`) or null
 */
export function formatModifiedNoteValue(
  wholeNoteFraction: number,
): string | null {
  for (const n of MODIFIER_NOTE_VALUE_DENOMINATORS) {
    if (Math.abs(wholeNoteFraction - 3 / (2 * n)) < MODIFIER_EPSILON) {
      return `/${n}d`;
    }

    if (Math.abs(wholeNoteFraction - 2 / (3 * n)) < MODIFIER_EPSILON) {
      return `/${n}t`;
    }
  }

  return null;
}
