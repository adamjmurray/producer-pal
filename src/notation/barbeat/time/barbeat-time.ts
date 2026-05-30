// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_BEATS_PER_BAR } from "#src/notation/barbeat/barbeat-config.ts";
import { formatBeatPosition } from "#src/notation/barbeat/serializer/helpers/barbeat-serializer-fractions.ts";
import * as console from "#src/shared/v8-max-console.ts";

const DURATION_EPSILON = 1e-9;
const DURATION_FRACTION_TOLERANCE = 1e-6;

// Denominators tried (smallest first) when converting Ableton beats back to a
// whole-note fraction for a LENGTH read-back. A subset of the canonical
// NOTE_VALUE_DENOMINATORS (this surface gcd-reduces, so it omits 1/2 — reduction
// reaches them — and 40, since a length already has the lossless n<beats>/4
// off-grid escape, so quintuplet-sixteenths fall through to it). The
// note-value-denominator-parity test locks this as a subset of the canonical set.
export const DURATION_DENOMINATOR_CANDIDATES = [
  4, 8, 16, 32, 64, 128, 256, 3, 6, 12, 24, 48, 96, 5, 10, 20, 7, 14,
];

interface BeatsPerBarOptions {
  beatsPerBar?: number;
  timeSigNumerator?: number;
  timeSigDenominator?: number;
}

/**
 * Parses beatsPerBar from options, validating time signature consistency.
 * @param options - Beats per bar configuration options
 * @returns Beats per bar value
 * @throws If only one of timeSigNumerator/timeSigDenominator is specified
 */
export function parseBeatsPerBar(options: BeatsPerBarOptions = {}): number {
  const {
    beatsPerBar: beatsPerBarOption,
    timeSigNumerator,
    timeSigDenominator,
  } = options;

  if (
    (timeSigNumerator != null && timeSigDenominator == null) ||
    (timeSigDenominator != null && timeSigNumerator == null)
  ) {
    throw new Error(
      "Time signature must be specified with both numerator and denominator",
    );
  }

  return timeSigNumerator ?? beatsPerBarOption ?? DEFAULT_BEATS_PER_BAR;
}

/**
 * Convert (musical) beats to bar|beat format.
 *
 * The beat field is serialized by {@link formatBeatPosition}, the single
 * canonical formatter shared with the note serializer: an integer or dyadic
 * sub-beat renders as a plain decimal (`1|2`, `1|1.5`), while a non-dyadic
 * (tuplet) position renders as an exact `base±n<fraction>` note-value offset
 * (`1|1+n/12` = beat 1 + an eighth triplet) so it round-trips losslessly —
 * `toFixed(3)` would round `1/3` to `0.333` and break the round-trip. The
 * offset's note-value unit is `timeSigDenominator`-relative, so it must be
 * threaded through (it defaults to 4 — quarter-note beats — when omitted).
 *
 * TODO: rename the non-duration-based functions in here (i.e. not the last two) to clearly indicate we are handling bar|beat positions
 * @param beats - Number of (musical) beats
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator (the `±n` offset unit)
 * @returns Formatted bar|beat string
 */
export function beatsToBarBeat(
  beats: number,
  beatsPerBar: number,
  timeSigDenominator?: number,
): string {
  // Pin the bar floor at 1 so a negative position (a note before the clip
  // start, e.g. `1|1-n/12` → -⅓ beats) serializes within bar 1 (`1|1-n/12`)
  // rather than bar 0 (`0|…`, which would re-parse to a different value). This
  // keeps negative positions round-trippable through barBeatToBeats. For beats
  // >= 0 the bar/beat split is identical to the old floor()+1 form;
  // formatBeatPosition handles the sub-1/negative beat as a `1-n<fraction>`.
  const bar = Math.max(1, Math.floor(beats / beatsPerBar) + 1);
  const beat = beats - (bar - 1) * beatsPerBar + 1;

  return `${bar}|${formatBeatPosition(beat, timeSigDenominator)}`;
}

/**
 * Convert bar|beat format to beats. The beat field is a 1-based grid beat,
 * optionally a decimal (`2|3.5`) or displaced by an absolute note-value offset
 * (`1|1+n/12` = beat 1 + an eighth triplet, `2|2-n/24`). A `-n` offset may pull
 * the position before its bar's downbeat (`2|1-n/12`); the bar is borrowed
 * automatically. A position before `1|1` resolves to negative time (a note
 * before the clip start) — allowed, never throws. Bare fractions (`4/3`) and
 * bar-relative mixed numbers (`1+1/3`) are not accepted — note values wear the
 * `n` sigil everywhere.
 * @param barBeat - Bar|beat string like "1|2", "2|3.5", or "1|1+n/12"
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator (for the `±n` offset unit)
 * @returns Number of beats
 */
export function barBeatToBeats(
  barBeat: string,
  beatsPerBar: number,
  timeSigDenominator?: number,
): number {
  const match = barBeat.match(/^(-?\d+)\|((-?\d+)(?:[+-]n\d*\/\d+|\.\d+)?)$/);

  if (!match) {
    throw new Error(
      `Invalid bar|beat format: "${barBeat}". Expected "{int}|{beat}" like "1|2" or "2|3.5", or a note-value offset like "1|1+n/12" (beat 1 + an eighth triplet) or "2|2-n/24"`,
    );
  }

  const bar = Number.parseInt(match[1] as string);
  const beatStr = match[2] as string;
  const beat = parseBeatValue(beatStr, barBeat, timeSigDenominator);

  // Beats are 1-based, so beat == beatsPerBar+1 is the downbeat of the next bar
  // (still "within reach" of this bar's end via a sub-beat/`+n` offset); anything
  // beyond that silently overflows multiple beats into a later, meter-dependent
  // bar and is almost certainly a mistake.
  if (beat > beatsPerBar + 1) {
    console.warn(
      `Beat ${beat} exceeds the bar (beatsPerBar=${beatsPerBar}); it will land in a later bar — did you mean a higher bar number?`,
    );
  }

  // A `-n` offset (or an explicit position below 1|1) may resolve to negative
  // time. This is allowed and never throws — Live accepts notes before the clip
  // start. The formula borrows from the bar automatically (`2|1-n/12` → 3⅔ in
  // 4/4; `1|1-n/12` → -⅓). Authoring warns once at interpret time; this
  // low-level conversion stays otherwise silent because it runs per-note in
  // transform timeRange checks (a warning here would spam).
  return (bar - 1) * beatsPerBar + (beat - 1);
}

/**
 * Convert time signature to Ableton beats (quarter notes) per bar
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Ableton beats per bar
 */
export function timeSigToAbletonBeatsPerBar(
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  return (timeSigNumerator * 4) / timeSigDenominator;
}

/**
 * Convert Ableton beats (quarter notes) to bar|beat format using musical beats
 * @param abletonBeats - Ableton beats (quarter notes)
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Formatted bar|beat string
 */
export function abletonBeatsToBarBeat(
  abletonBeats: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): string {
  const musicalBeatsPerBar = timeSigNumerator;
  const musicalBeats = abletonBeats * (timeSigDenominator / 4);

  return beatsToBarBeat(musicalBeats, musicalBeatsPerBar, timeSigDenominator);
}

/**
 * Convert bar|beat format to Ableton beats (quarter notes) using musical beats
 * @param barBeat - Bar|beat string
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Ableton beats (quarter notes)
 */
export function barBeatToAbletonBeats(
  barBeat: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  const musicalBeatsPerBar = timeSigNumerator;
  const musicalBeats = barBeatToBeats(
    barBeat,
    musicalBeatsPerBar,
    timeSigDenominator,
  );

  return musicalBeats * (4 / timeSigDenominator);
}

/**
 * Convert Ableton beats (quarter notes) to a duration string in the unified
 * duration grammar. Note-value fractions are whole-note based and carry the `n`
 * prefix (`n/4` = quarter, `n/8` = eighth, `n/12` = eighth triplet; numerator
 * omitted when 1). The bar component is meter-aware and never wears an `n`.
 *
 * This function is **total**: it never throws for a length/duration value. A
 * negative value (which a transform can produce before its own clamp catches
 * it) warns and is treated as 0 rather than throwing.
 * On-grid values get an exact note-value spelling; off-grid values (only ever
 * produced by *measuring* a sample-derived length, never by authoring) fall
 * back to a decimal-numerator note value pinned to `/4` (`n<beats>/4`), where
 * the numerator reads directly as the beat count (`n1.9638/4` == 1.9638
 * Ableton beats). This keeps the off-grid escape under the `n` sigil and
 * round-trips back through `durationToAbletonBeats`.
 *
 * Output shapes:
 *  - `0bar` (zero duration)
 *  - `Nbar` (multiple of one bar)
 *  - `n<fraction>` (sub-bar, e.g. `n/4`)
 *  - `Nbar+n<fraction>` (mixed, e.g. `1bar+n/4`)
 *  - `n<beats>/4` (off-grid, e.g. `n1.9638/4`) — the whole value as a
 *    decimal-numerator note value, fixed precision
 * @param abletonBeats - Ableton beats (quarter notes)
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Formatted duration string
 */
export function abletonBeatsToDuration(
  abletonBeats: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): string {
  if (abletonBeats < 0) {
    console.warn(
      `duration cannot be negative, got ${abletonBeats}; clamped to 0`,
    );
    abletonBeats = 0;
  }

  const abletonBeatsPerBar = timeSigToAbletonBeatsPerBar(
    timeSigNumerator,
    timeSigDenominator,
  );

  const bars = Math.floor(abletonBeats / abletonBeatsPerBar + DURATION_EPSILON);
  const remaining = abletonBeats - bars * abletonBeatsPerBar;

  if (Math.abs(remaining) < DURATION_EPSILON) {
    return `${bars}bar`;
  }

  const frac = abletonBeatsToWholeNoteFraction(remaining);

  if (frac == null) {
    // Off-grid (sample-derived) length: no exact note-value fraction exists.
    // Spell the whole value as a decimal-numerator note value pinned to `/4`
    // (`n<beats>/4` == <beats> Ableton beats, since `n<x>/4` = x quarters),
    // keeping the escape under the `n` sigil so the duration vocabulary stays
    // uniform — never a bare number. The `/4` denominator makes the numerator
    // read directly as the beat count.
    return `n${formatOffGridBeats(abletonBeats)}/4`;
  }

  // Canonical note-value spelling: `n` prefix, numerator omitted when 1.
  const fracStr =
    frac.numerator === 1
      ? `n/${frac.denominator}`
      : `n${frac.numerator}/${frac.denominator}`;

  return bars > 0 ? `${bars}bar+${fracStr}` : fracStr;
}

/**
 * Convert a duration string to Ableton beats (quarter notes).
 *
 * Accepted shapes:
 *  - `Nbar` — N bars (meter-aware; `bar` is its own type marker)
 *  - `n<fraction>` — note value. The numerator may be an integer (`n3/8` = three
 *    eighths; defaults to 1, so `n/4` == `n1/4`) or a decimal (`n1.9638/4` =
 *    1.9638 quarters), the off-grid escape `abletonBeatsToDuration` emits.
 *  - `Nbar+n<fraction>` — bars plus sub-bar note value (e.g. `1bar+n/4`); the
 *    tail numerator may likewise be a decimal.
 *
 * Bare numbers (`5`, `1.9638`) and bare *fractions* (`1/4`) are both rejected: a
 * duration is always a bar count or an `n`-prefixed note value, never a bare
 * scalar. (A bare fraction would read as beats — transforms-as-arithmetic — not
 * a note value; the `n` prefix keeps "note value" unambiguous on every surface.)
 * Off-grid lengths use the decimal-numerator escape `n<beats>/4` that
 * `abletonBeatsToDuration` emits, so round-trips need no bare-number support.
 * @param duration - Duration string
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Ableton beats (quarter notes)
 */
export function durationToAbletonBeats(
  duration: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  // Numerator may be empty (→ 1), an integer, or a decimal (the `n<beats>/4`
  // off-grid escape, e.g. `n1.9638/4`). Denominator is always an integer.
  const match = duration.match(
    /^(?:(\d+)bar(?:\+n(\d+\.\d+|\d*)\/(\d+))?|n(\d+\.\d+|\d*)\/(\d+))$/,
  );

  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Expected "Nbar" (e.g. "4bar"), "n<fraction>" (e.g. "n/4", "n1/4", or off-grid "n1.9638/4"), or "Nbar+n<fraction>" (e.g. "1bar+n/4"). Note values require the "n" prefix; a bare number or bare fraction is not a duration.`,
    );
  }

  const bars = match[1] != null ? Number.parseInt(match[1]) : 0;
  const divisionByZero = `Invalid duration: division by zero in "${duration}"`;
  // Whole-note fraction → quarter notes (Ableton beats), so scale = 4. The tail
  // is absent for a pure `Nbar` (fractionBeats stays 0).
  let fractionBeats = 0;

  if (match[3] != null) {
    // Nbar+n<fraction> form (numerator in match[2], denominator in match[3])
    fractionBeats = noteValueFractionToBeats(
      match[2] as string,
      match[3],
      4,
      divisionByZero,
    );
  } else if (match[5] != null) {
    // n<fraction> only (numerator in match[4], denominator in match[5])
    fractionBeats = noteValueFractionToBeats(
      match[4] as string,
      match[5],
      4,
      divisionByZero,
    );
  }

  const abletonBeatsPerBar = timeSigToAbletonBeatsPerBar(
    timeSigNumerator,
    timeSigDenominator,
  );

  return bars * abletonBeatsPerBar + fractionBeats;
}

/**
 * Parse a beat value string: a plain integer/decimal grid beat, or a grid beat
 * displaced by a `±n<fraction>` note-value offset (`1+n/12`, `2-n1/24`). The
 * offset fraction is whole-note based; the denominator converts it to musical
 * beats. Callers pre-validate the string shape with a regex.
 * @param beatsStr - Beat value string
 * @param context - Original string for error messages
 * @param timeSigDenominator - Time signature denominator (for the offset unit)
 * @returns Parsed beat value
 */
function parseBeatValue(
  beatsStr: string,
  context: string,
  timeSigDenominator: number | undefined,
): number {
  // Grid beat ± a note-value offset: `1+n/12`, `2-n1/24` (numerator omitted = 1).
  const offsetMatch = beatsStr.match(/^(-?\d+)([+-])n(\d*)\/(\d+)$/);

  if (offsetMatch) {
    const base = Number.parseInt(offsetMatch[1] as string);
    const sign = offsetMatch[2];
    // Whole-note fraction → musical beats, so scale = timeSigDenominator.
    const offsetBeats = noteValueFractionToBeats(
      offsetMatch[3] as string,
      offsetMatch[4] as string,
      timeSigDenominator ?? 4,
      `Invalid bar|beat format: division by zero in "${context}"`,
    );

    return sign === "+" ? base + offsetBeats : base - offsetBeats;
  }

  // Plain integer or decimal grid beat.
  return Number.parseFloat(beatsStr);
}

/**
 * Interpret a note-value fraction — the numerator/denominator captured by the
 * duration (`durationToAbletonBeats`) and `±n`-offset (`parseBeatValue`) regexes
 * — and scale it into the caller's beat unit. This is the single place the
 * note-value-fraction arithmetic lives, shared by both regex parsers in this
 * file. The two Peggy grammars (`barbeat`/`transform`) carry their own lexer
 * copies — Peggy cannot import — and are pinned to this same language by the
 * cross-site parity test (`note-value-grammar-parity.test.ts`).
 *
 * An empty numerator means 1 (`n/4` == `n1/4`). `parseFloat` also accepts the
 * decimal numerator of the off-grid duration escape (`n1.9638/4`); the regexes
 * gate which surfaces admit a decimal (duration only).
 * @param numeratorStr - Numerator capture ("" → 1)
 * @param denominatorStr - Denominator capture
 * @param scale - Whole-note→beat factor: 4 for Ableton beats, or the time-sig
 *   denominator for musical beats
 * @param divisionByZeroError - Message to throw when the denominator is 0
 * @returns The fraction scaled into the caller's beat unit
 */
function noteValueFractionToBeats(
  numeratorStr: string,
  denominatorStr: string,
  scale: number,
  divisionByZeroError: string,
): number {
  const numerator = numeratorStr === "" ? 1 : Number.parseFloat(numeratorStr);
  const denominator = Number.parseInt(denominatorStr);

  if (denominator === 0) {
    throw new Error(divisionByZeroError);
  }

  return (numerator / denominator) * scale;
}

/**
 * Express remaining Ableton beats as a reduced whole-note fraction.
 * Returns null when no candidate denominator yields a near-integer numerator.
 * @param abletonBeats - Sub-bar Ableton beats (quarter notes)
 * @returns Reduced fraction or null
 */
function abletonBeatsToWholeNoteFraction(
  abletonBeats: number,
): { numerator: number; denominator: number } | null {
  // Whole-note fraction = abletonBeats / 4 (since 1 whole note = 4 quarters)
  const target = abletonBeats / 4;

  for (const denominator of DURATION_DENOMINATOR_CANDIDATES) {
    const scaled = target * denominator;
    const rounded = Math.round(scaled);

    if (
      Math.abs(scaled - rounded) < DURATION_FRACTION_TOLERANCE &&
      rounded > 0
    ) {
      const divisor = gcd(rounded, denominator);

      return {
        numerator: rounded / divisor,
        denominator: denominator / divisor,
      };
    }
  }

  return null;
}

/**
 * Format an off-grid length as the decimal numerator of an `n<beats>/4` note
 * value: fixed precision with trailing zeros (and a bare trailing dot)
 * stripped. Integers render without a decimal.
 * @param beats - Ableton beats (quarter notes)
 * @returns Numerator string (e.g. "1.9638", "2")
 */
function formatOffGridBeats(beats: number): string {
  if (Number.isInteger(beats)) {
    return beats.toString();
  }

  return beats.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * Greatest common divisor.
 * @param a - First integer
 * @param b - Second integer
 * @returns GCD of |a| and |b|
 */
function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);

  while (y !== 0) {
    [x, y] = [y, x % y];
  }

  return x;
}
