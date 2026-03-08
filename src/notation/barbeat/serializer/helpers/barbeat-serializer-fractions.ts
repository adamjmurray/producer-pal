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
  const intPart = Math.floor(value);
  const fracPart = value - intPart;
  const fraction = findFraction(fracPart);

  if (fraction) {
    const mixedStr = `${intPart}+${fraction.num}/${fraction.den}`;

    return preferFractionOrDecimal(mixedStr, value);
  }

  return formatDecimal(value);
}

/**
 * Format an unsigned value for durations and repeat steps.
 * Can be < 1 (parser: unsignedFloat). Supports /4 shorthand (numerator=1 implied).
 * Fractions are required when decimal representation is lossy (e.g., 1/3 → 0.333).
 * @param value - Duration or step value (>= 0)
 * @returns Formatted value string
 */
export function formatUnsignedValue(value: number): string {
  if (value % 1 === 0) return value.toString();

  if (value < 1) {
    const fraction = findFraction(value);

    if (fraction) {
      // Use /den shorthand when numerator is 1
      const fractionStr =
        fraction.num === 1
          ? `/${fraction.den}`
          : `${fraction.num}/${fraction.den}`;

      return preferFractionOrDecimal(fractionStr, value);
    }

    return formatDecimal(value);
  }

  // value >= 1 with fractional part
  const intPart = Math.floor(value);
  const fracPart = value - intPart;
  const fraction = findFraction(fracPart);

  if (fraction) {
    const mixedStr = `${intPart}+${fraction.num}/${fraction.den}`;

    return preferFractionOrDecimal(mixedStr, value);
  }

  return formatDecimal(value);
}

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
 * Format a number as decimal, removing trailing zeros.
 * @param value - Number to format
 * @returns Formatted decimal string
 */
export function formatDecimal(value: number): string {
  return value % 1 === 0
    ? value.toString()
    : value.toFixed(3).replace(/\.?0+$/, "");
}
