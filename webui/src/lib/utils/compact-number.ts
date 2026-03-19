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
