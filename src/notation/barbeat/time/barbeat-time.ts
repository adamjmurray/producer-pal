// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_BEATS_PER_BAR } from "#src/notation/barbeat/barbeat-config.ts";

const DURATION_EPSILON = 1e-9;
const DURATION_FRACTION_TOLERANCE = 1e-6;
// Denominators tried (smallest first) when converting Ableton beats back to a
// whole-note fraction. Covers binary (4..256), triplet/sextuplet families (3,
// 6, 12, 24, 48, 96), and quintuplet/septuplet families (5, 10, 20, 7, 14).
const DURATION_DENOMINATOR_CANDIDATES = [
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
 * Convert beats to bar|beat format.
 * TODO: rename the non-duration-based functions in here (i.e. not the last two) to clearly indicate we are handling bar|beat positions
 * @param beats - Number of beats
 * @param beatsPerBar - Beats per bar
 * @returns Formatted bar|beat string
 */
export function beatsToBarBeat(beats: number, beatsPerBar: number): string {
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beat = (beats % beatsPerBar) + 1;

  // Format beat - avoid unnecessary decimals

  const beatFormatted =
    beat % 1 === 0 ? beat.toString() : beat.toFixed(3).replace(/\.?0+$/, "");

  return `${bar}|${beatFormatted}`;
}

/**
 * Convert bar|beat format to beats
 * @param barBeat - Bar|beat string like "1|2" or "2|3.5"
 * @param beatsPerBar - Beats per bar
 * @returns Number of beats
 */
export function barBeatToBeats(barBeat: string, beatsPerBar: number): number {
  const match = barBeat.match(
    /^(-?\d+)\|((-?\d+)(?:\+\d+\/\d+|\.\d+|\/\d+)?)$/,
  );

  if (!match) {
    throw new Error(
      `Invalid bar|beat format: "${barBeat}". Expected "{int}|{float}" like "1|2" or "2|3.5" or "{int}|{int}/{int}" like "1|4/3" or "{int}|{int}+{int}/{int}" like "1|2+1/3"`,
    );
  }

  const bar = Number.parseInt(match[1] as string);
  const beatStr = match[2] as string;
  const beat = parseBeatValue(beatStr, barBeat, "bar|beat");

  if (bar < 1) {
    throw new Error(`Bar number must be 1 or greater, got: ${bar}`);
  }

  if (beat < 1) {
    throw new Error(`Beat must be 1 or greater, got: ${beat}`);
  }

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

  return beatsToBarBeat(musicalBeats, musicalBeatsPerBar);
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
  const musicalBeats = barBeatToBeats(barBeat, musicalBeatsPerBar);

  return musicalBeats * (4 / timeSigDenominator);
}

/**
 * Convert Ableton beats (quarter notes) to a duration string in the
 * `[Nbar+]n<fraction>` grammar. Note-value fractions are whole-note based and
 * carry the `n` prefix (`n/4` = quarter, `n/8` = eighth, `n/12` = eighth
 * triplet; numerator omitted when 1). The bar component is meter-aware.
 *
 * Output shapes:
 *  - `Nbar` (multiple of one bar)
 *  - `n<fraction>` (sub-bar, e.g. `n/4`)
 *  - `Nbar+n<fraction>` (mixed, e.g. `1bar+n/4`)
 *  - `0bar` (zero duration)
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
    throw new Error(`Duration cannot be negative, got: ${abletonBeats}`);
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
    throw new Error(
      `Cannot represent ${remaining} Ableton beats as a whole-note fraction`,
    );
  }

  // Canonical note-value spelling: `n` prefix, numerator omitted when 1.
  const fracStr =
    frac.numerator === 1
      ? `n/${frac.denominator}`
      : `n${frac.numerator}/${frac.denominator}`;

  return bars > 0 ? `${bars}bar+${fracStr}` : fracStr;
}

/**
 * Convert a `[Nbar+]n<fraction>` duration string to Ableton beats (quarter notes).
 *
 * Accepted shapes:
 *  - `Nbar` — N bars (meter-aware; `bar` is its own type marker)
 *  - `n<fraction>` — note value (e.g. `n/4` = quarter, `n3/8` = three eighths;
 *    numerator defaults to 1, so `n/4` == `n1/4`)
 *  - `Nbar+n<fraction>` — bars plus sub-bar note value (e.g. `1bar+n/4`)
 *
 * Bare fractions (`1/4`) are rejected: in notation a bare fraction means beats
 * (transforms-as-arithmetic), never a note value. The `n` prefix keeps that
 * invariant — `n<fraction>` is a note value everywhere.
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
  const match = duration.match(
    /^(?:(\d+)bar(?:\+n(\d*)\/(\d+))?|n(\d*)\/(\d+))$/,
  );

  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Expected "Nbar" (e.g. "4bar"), "n<fraction>" (e.g. "n/4" or "n1/4"), or "Nbar+n<fraction>" (e.g. "1bar+n/4"). Note-value fractions require the "n" prefix; a bare fraction means beats, not a note value.`,
    );
  }

  const bars = match[1] != null ? Number.parseInt(match[1]) : 0;
  let numerator = 0;
  let denominator = 1;

  if (match[3] != null) {
    // Nbar+n<fraction> form (numerator defaults to 1 when empty)
    numerator = match[2] === "" ? 1 : Number.parseInt(match[2] as string);
    denominator = Number.parseInt(match[3]);
  } else if (match[5] != null) {
    // n<fraction> only (numerator defaults to 1 when empty)
    numerator = match[4] === "" ? 1 : Number.parseInt(match[4] as string);
    denominator = Number.parseInt(match[5]);
  }

  if (denominator === 0) {
    throw new Error(`Invalid duration: division by zero in "${duration}"`);
  }

  const abletonBeatsPerBar = timeSigToAbletonBeatsPerBar(
    timeSigNumerator,
    timeSigDenominator,
  );
  // Whole-note fraction → quarter notes (Ableton beats): (n/d) * 4
  const fractionBeats = (numerator / denominator) * 4;

  return bars * abletonBeatsPerBar + fractionBeats;
}

/**
 * Parse a beat value string (supports fractions and mixed numbers)
 * @param beatsStr - Beat value string
 * @param context - Original string for error messages
 * @param formatType - Type of format for error messages (e.g., "duration", "bar|beat")
 * @returns Parsed beat value
 */
function parseBeatValue(
  beatsStr: string,
  context: string,
  formatType = "duration",
): number {
  if (beatsStr.includes("+")) {
    const plusParts = beatsStr.split("+");
    const intPart = plusParts[0] as string;
    const fracPart = plusParts[1] as string;
    const num = Number.parseInt(intPart);

    if (Number.isNaN(num)) {
      throw new Error(`Invalid ${formatType} format: "${context}"`);
    }

    const slashParts = fracPart.split("/");
    const numerator = slashParts[0] as string;
    const denominator = slashParts[1] as string;
    const fracNum = Number.parseInt(numerator);
    const fracDen = Number.parseInt(denominator);

    if (fracDen === 0) {
      throw new Error(
        `Invalid ${formatType} format: division by zero in "${context}"`,
      );
    }

    if (Number.isNaN(fracNum) || Number.isNaN(fracDen)) {
      throw new Error(`Invalid ${formatType} format: "${context}"`);
    }

    return num + fracNum / fracDen;
  }

  if (beatsStr.includes("/")) {
    const parts = beatsStr.split("/");
    const numerator = parts[0] as string;
    const denominator = parts[1] as string;
    const num = Number.parseInt(numerator);
    const den = Number.parseInt(denominator);

    if (den === 0) {
      throw new Error(
        `Invalid ${formatType} format: division by zero in "${context}"`,
      );
    }

    if (Number.isNaN(num) || Number.isNaN(den)) {
      throw new Error(`Invalid ${formatType} format: "${context}"`);
    }

    return num / den;
  }

  const beats = Number.parseFloat(beatsStr);

  if (Number.isNaN(beats)) {
    throw new Error(`Invalid ${formatType} format: "${context}"`);
  }

  return beats;
}

/**
 * Parse bar:beat format and return musical beats
 * @param barBeatDuration - Bar:beat duration string
 * @param timeSigNumerator - Time signature numerator
 * @returns Musical beats
 */
function parseBarBeatFormat(
  barBeatDuration: string,
  timeSigNumerator: number,
): number {
  const match = barBeatDuration.match(
    /^(-?\d+):((-?\d+)(?:\+\d+\/\d+|\.\d+|\/\d+)?)$/,
  );

  if (!match) {
    throw new Error(
      `Invalid bar:beat duration format: "${barBeatDuration}". Expected "{int}:{float}" like "1:2" or "2:1.5" or "{int}:{int}/{int}" like "0:4/3" or "{int}:{int}+{int}/{int}" like "1:2+1/3"`,
    );
  }

  const bars = Number.parseInt(match[1] as string);
  const beatsStr = match[2] as string;
  const beats = parseBeatValue(beatsStr, barBeatDuration);

  if (bars < 0) {
    throw new Error(`Bars in duration must be 0 or greater, got: ${bars}`);
  }

  if (beats < 0) {
    throw new Error(`Beats in duration must be 0 or greater, got: ${beats}`);
  }

  const musicalBeatsPerBar = timeSigNumerator;

  return bars * musicalBeatsPerBar + beats;
}

/**
 * Convert bar:beat or beat-only duration to musical beats
 * @param barBeatDuration - Bar:beat duration string or beat-only string
 * @param timeSigNumerator - Time signature numerator (required for bar:beat format)
 * @returns Musical beats
 */
export function barBeatDurationToMusicalBeats(
  barBeatDuration: string,
  timeSigNumerator: number | undefined,
): number {
  // Check if it's bar:beat format or beat-only
  if (barBeatDuration.includes(":")) {
    if (timeSigNumerator == null) {
      throw new Error(
        `Time signature numerator required for bar:beat duration format: "${barBeatDuration}"`,
      );
    }

    return parseBarBeatFormat(barBeatDuration, timeSigNumerator);
  }

  // Beat-only format (decimal, fraction, or integer+fraction)
  if (barBeatDuration.includes("|")) {
    throw new Error(
      `Invalid duration format: "${barBeatDuration}". Use ":" for bar:beat format, not "|"`,
    );
  }

  const beats = parseBeatValue(barBeatDuration, barBeatDuration);

  if (beats < 0) {
    throw new Error(`Beats in duration must be 0 or greater, got: ${beats}`);
  }

  return beats;
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
