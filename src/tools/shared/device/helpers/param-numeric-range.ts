// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseLabel, strForValue } from "./device-label-helpers.ts";

// Probes to find where a sentinel word ends. Each is one str_for_value call,
// but the word sits on the endpoint alone in every case seen in Live, so the
// first probe normally brackets it and nothing more is needed.
const TRIM_PROBES = 20;

interface NumericPoint {
  raw: number;
  value: number;
  label: string;
}

export interface ParamNumericRange {
  rawMin: number;
  rawMax: number;
  minValue: number;
  maxValue: number;
  minLabel: string;
  maxLabel: string;
  /** A word at one end of the range, trimmed off the numbers above. */
  sentinel: { label: string; raw: number } | null;
}

/**
 * The numeric part of a parameter's display range.
 *
 * Some parameters put a word at one end: Glue Compressor's Release reads "A"
 * (Auto) at its top, Compressor's Ratio reads "inf : 1", Analog's S Time reads
 * "inf s". Everything below is an ordinary number line, so trim the word off
 * and report it separately — the caller searches the numbers and keeps the word
 * reachable by name.
 *
 * Returns null when *both* ends are non-numeric, which means there is no number
 * line to find: a note-name parameter, or a word list like Hybrid Reverb's
 * Vintage ("Off".."Extreme").
 * @param param - DeviceParameter LiveAPI object
 * @param rawMin - Raw minimum value
 * @param rawMax - Raw maximum value
 * @param minLabel - Already-computed str_for_value(rawMin)
 * @param maxLabel - Already-computed str_for_value(rawMax)
 * @returns The numeric range, or null if the parameter has none
 */
export function readNumericRange(
  param: LiveAPI,
  rawMin: number,
  rawMax: number,
  minLabel: string,
  maxLabel: string,
): ParamNumericRange | null {
  const minValue = numericLabel(minLabel);
  const maxValue = numericLabel(maxLabel);

  if (minValue != null && maxValue != null) {
    return {
      rawMin,
      rawMax,
      minValue,
      maxValue,
      minLabel,
      maxLabel,
      sentinel: null,
    };
  }

  if (minValue == null && maxValue == null) {
    return null;
  }

  const minIsWord = minValue == null;
  const goodEnd: NumericPoint = minIsWord
    ? { raw: rawMax, value: maxValue as number, label: maxLabel }
    : { raw: rawMin, value: minValue, label: minLabel };
  const badEnd = minIsWord ? rawMin : rawMax;
  const trimmed = trimSentinel(param, goodEnd, badEnd);

  if (trimmed == null) {
    return null;
  }

  const sentinel = { label: minIsWord ? minLabel : maxLabel, raw: badEnd };

  return minIsWord
    ? {
        rawMin: trimmed.raw,
        rawMax,
        minValue: trimmed.value,
        maxValue: maxValue as number,
        minLabel: trimmed.label,
        maxLabel,
        sentinel,
      }
    : {
        rawMin,
        rawMax: trimmed.raw,
        minValue: minValue,
        maxValue: trimmed.value,
        minLabel,
        maxLabel: trimmed.label,
        sentinel,
      };
}

/**
 * The raw value to write when a string names the range's sentinel. Matching is
 * case- and space-insensitive so a label the model echoes back from a read
 * still lands.
 * @param range - The parameter's numeric range
 * @param input - The requested value
 * @returns The sentinel's raw value, or null if the input doesn't name it
 */
export function sentinelRawValue(
  range: ParamNumericRange,
  input: string,
): number | null {
  const { sentinel } = range;

  if (sentinel == null) return null;

  const matches =
    input.trim().toLowerCase() === sentinel.label.trim().toLowerCase();

  return matches ? sentinel.raw : null;
}

/**
 * Parse a display label to a number, rejecting the non-numeric forms
 * (note names, words) parseLabel also returns. parseLabel never returns NaN, so
 * a label like "---" arrives here as null already.
 * @param label - Display label from str_for_value()
 * @returns The number, or null if the label isn't one
 */
export function numericLabel(label: string): number | null {
  const value = parseLabel(label).value;

  return value == null || typeof value === "string" ? null : value;
}

/**
 * Read a parameter's display value at a raw value.
 * @param param - DeviceParameter LiveAPI object
 * @param raw - Raw value to query
 * @returns Display value, or null if the label isn't a number
 */
export function displayAt(param: LiveAPI, raw: number): number | null {
  return pointAt(param, raw)?.value ?? null;
}

/**
 * The numeric point nearest the end whose label is a word.
 *
 * Probes step out from the bad end, so a word sitting on the endpoint alone —
 * every case seen in Live — is bracketed by the first call. Bisecting that
 * bracket is the part that makes the answer tight: the probe that first reads
 * as a number can sit twice as far out as the word actually reaches, and
 * everything between the two is range the model never gets told about.
 * @param param - DeviceParameter LiveAPI object
 * @param goodEnd - The end whose label is a number
 * @param badEnd - The raw end whose label is a word
 * @returns The nearest raw value with a numeric label, or null when the numbers
 *   reach no further than goodEnd itself
 */
function trimSentinel(
  param: LiveAPI,
  goodEnd: NumericPoint,
  badEnd: number,
): NumericPoint | null {
  const span = badEnd - goodEnd.raw;
  const tolerance = Math.abs(span) * 2 ** -TRIM_PROBES;
  // The bracket: `word` reads as the word, `nearest` reads as a number. goodEnd
  // is a number by construction, so the bracket is valid before any probe.
  let word = badEnd;
  let nearest = goodEnd;

  for (let i = TRIM_PROBES; i >= 1; i--) {
    const raw = badEnd - span * 2 ** -i;
    const point = pointAt(param, raw);

    if (point != null) {
      nearest = point;
      break;
    }

    word = raw;
  }

  // Halving a bracket at most |span| wide TRIM_PROBES times reaches tolerance,
  // so this terminates on the condition, never on the bound.
  for (
    let i = 0;
    i < TRIM_PROBES && Math.abs(nearest.raw - word) > tolerance;
    i++
  ) {
    const raw = (word + nearest.raw) / 2;
    const point = pointAt(param, raw);

    if (point == null) {
      word = raw;
    } else {
      nearest = point;
    }
  }

  return nearest.raw === goodEnd.raw ? null : nearest;
}

/**
 * Read a parameter's label at a raw value, keeping the label alongside the
 * number it parses to.
 * @param param - DeviceParameter LiveAPI object
 * @param raw - Raw value to query
 * @returns The point, or null if the label isn't a number
 */
function pointAt(param: LiveAPI, raw: number): NumericPoint | null {
  const label = strForValue(param, raw);
  const value = numericLabel(label);

  return value == null ? null : { raw, value, label };
}
