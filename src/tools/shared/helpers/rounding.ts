// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Round to Live's 2-decimal display precision — dB, pan, and tempo all show
 * this way.
 * @param value - Raw numeric value
 * @returns Value rounded to two decimal places
 */
export function round2dp(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Round a pan value to Live's 1% resolution (e.g. "30L"); the raw float
 * carries noise like -0.30000001192092896.
 * @param pan - Raw pan value from -1 to 1
 * @returns Pan rounded to two decimals
 */
export function roundPan(pan: number): number {
  return round2dp(pan);
}

/**
 * Round a gain to Live's 0.01 dB display resolution; the raw float32 carries
 * noise like -6.333000183105469.
 * @param gainDb - Raw gain in dB
 * @returns Gain rounded to two decimals
 */
export function roundGainDb(gainDb: number): number {
  return round2dp(gainDb);
}

/**
 * Parse a value that may have arrived as a numeric string. Max serializes a
 * float32 in exponent notation (tiny pan, gain, or tempo noise) as a STRING on
 * the wire, so a value that is really a number can arrive as text —
 * `typeof value === "number"` alone misses it.
 * @param value - Raw value from the Live API
 * @returns The value as a number, or undefined when it isn't numeric
 */
export function asFiniteNumber(value: unknown): number | undefined {
  const num = typeof value === "string" ? Number(value) : value;

  return typeof num === "number" && Number.isFinite(num) ? num : undefined;
}

/**
 * Round a float property to Live's display precision, at the point it becomes
 * a result field. Parses a value Max serialized as a numeric string (see
 * {@link asFiniteNumber}); anything else — including a non-numeric label —
 * passes through unchanged.
 *
 * Never use this on a value that still feeds arithmetic or bar|beat conversion
 * (beat positions, times, lengths) — only on what's reported for a human to
 * read.
 * @param value - Raw value from the Live API
 * @param round - The display-precision rounding for this kind of value
 *   (roundPan, roundGainDb, round2dp, ...)
 * @returns The rounded number, or the original value when it isn't numeric
 */
export function roundDisplayValue<T>(
  value: T,
  round: (num: number) => number,
): number | T {
  const num = asFiniteNumber(value);

  return num == null ? value : round(num);
}
