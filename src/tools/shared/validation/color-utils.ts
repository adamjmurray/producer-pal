// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Parse a comma-separated string when creating/updating multiple items.
 * Only splits when count > 1 and the value contains a comma.
 * @param value - Input string that may contain commas
 * @param count - Number of items being processed
 * @returns Array of trimmed strings, or null if not applicable
 */
export function parseCommaSeparatedValues(
  value: string | undefined,
  count: number,
): string[] | null {
  if (count <= 1 || !value?.includes(",")) {
    return null;
  }

  return value.split(",").map((v) => v.trim());
}

/**
 * Parse comma-separated colors when creating/updating multiple items.
 * Only splits when count > 1 and the value contains a comma.
 * @param value - Input string that may contain commas
 * @param count - Number of items being colored
 * @returns Array of trimmed color strings, or null if not applicable
 */
export function parseCommaSeparatedColors(
  value: string | undefined,
  count: number,
): string[] | null {
  return parseCommaSeparatedValues(value, count);
}

/**
 * Get color for a specific index when creating/updating multiple items.
 * When parsedColors is provided, cycles through them via modulo
 * (e.g., 3 colors for 5 items → color1, color2, color3, color1, color2).
 * @param color - Base color string (the raw parameter value)
 * @param index - Current item index
 * @param parsedColors - Comma-separated colors array, or null
 * @returns Color for this index, or undefined if color was not provided
 */
export function getColorForIndex(
  color: string | undefined,
  index: number,
  parsedColors: string[] | null,
): string | undefined {
  if (color == null) return;
  if (parsedColors == null) return color;

  return parsedColors[index % parsedColors.length] as string;
}
