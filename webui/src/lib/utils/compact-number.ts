// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Format a number in compact locale-aware notation (e.g. 17,123 → "17.1K").
 * @param n - Number to format
 * @returns Compact string
 */
export function compactNumber(n: number): string {
  return compactFormatter.format(n);
}

/**
 * Calculate new content tokens added between consecutive steps.
 * Returns null for the first step or when the result is non-positive
 * (can happen due to provider caching/quantization).
 * @param currentInput - Current step's input tokens
 * @param prevInput - Previous step's input tokens
 * @param prevOutput - Previous step's output tokens
 * @returns Positive new content token count, or null
 */
export function calcNewContentTokens(
  currentInput: number,
  prevInput: number | undefined,
  prevOutput: number | undefined,
): number | null {
  if (prevInput == null || prevOutput == null) return null;

  const delta = currentInput - prevInput - prevOutput;

  return delta > 0 ? delta : null;
}
