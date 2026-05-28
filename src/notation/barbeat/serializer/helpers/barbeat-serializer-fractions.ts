// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Common denominators to check for fraction conversion.
 * Ordered by musical relevance (quarter, third, eighth, sixth, etc.)
 */
const DENOMINATORS = [2, 3, 4, 6, 8, 12, 16];

/** Tolerance for floating-point fraction matching */
const EPSILON = 0.0005;

/**
 * Format a beat position value, preferring fractions when shorter or more exact.
 * Beat positions must be >= 1 (parser constraint: oneOrMoreFloat).
 * Uses integer, fraction (4/3), or mixed number (1+1/4) format.
 * Fractions are required when decimal representation is lossy (e.g., 1/3 → 0.333).
 * @param value - Beat position value (must be >= 1)
 * @returns Formatted beat position string
 */
export function formatBeatPosition(value: number): string {
  if (value % 1 === 0) return value.toString();

  // For beat positions, only use mixed number format (not whole fractions like 5/4)
  // because "1+1/4" is more readable than "5/4" in a musical context
  return formatMixedNumber(value) ?? formatDecimal(value);
}

/**
 * Format an absolute duration/step value as a `<num>/<den>` fraction of a whole note.
 * Used for `t` durations and `@step` intervals in bar|beat notation.
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
 * Choose between a fraction string and decimal, preferring decimal when it's
 * shorter AND lossless. Uses fraction when decimal would lose precision.
 * @param fractionStr - Pre-formatted fraction string
 * @param value - Original numeric value
 * @returns The preferred representation
 */
function preferFractionOrDecimal(fractionStr: string, value: number): string {
  if (!decimalIsLossless(value)) {
    // Decimal is lossy — fraction required for correctness
    return fractionStr;
  }

  const decimalStr = formatDecimal(value);

  // Both are exact — prefer shorter, fraction wins ties
  return decimalStr.length < fractionStr.length ? decimalStr : fractionStr;
}

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
 * Find a simple fraction representation for a value between 0 and 1 (exclusive).
 * @param value - Fractional value (0 < value < 1)
 * @returns Numerator and denominator, or null if no clean fraction found
 */
function findFraction(value: number): { num: number; den: number } | null {
  for (const den of DENOMINATORS) {
    for (let num = 1; num < den; num++) {
      if (Math.abs(value - num / den) < EPSILON) {
        return { num, den };
      }
    }
  }

  return null;
}

/**
 * Try to format a value >= 1 as a mixed number (e.g., "1+1/4").
 * @param value - Number with integer and fractional parts
 * @returns Mixed number string, or null if no clean fraction found
 */
function formatMixedNumber(value: number): string | null {
  const intPart = Math.floor(value);
  const fracPart = value - intPart;
  const fraction = findFraction(fracPart);

  if (!fraction) return null;

  const mixedStr = `${intPart}+${fraction.num}/${fraction.den}`;

  return preferFractionOrDecimal(mixedStr, value);
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
