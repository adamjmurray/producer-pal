// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { splitList } from "#src/tools/shared/validation/list-pairing.ts";

/**
 * Parse a comma-separated color param.
 * @param value - The raw color param
 * @param count - How many items the call acts on
 * @returns One color per item, or null when the value covers every item
 */
export function parseCommaSeparatedColors(
  value: string | undefined,
  count: number,
): string[] | null {
  return splitList(value, count);
}

/**
 * The color for one item, cycling through the list.
 *
 * Color is the one param that still cycles: three colors over six clips
 * repeats red, blue, green, red, blue, green. Every schema description says so
 * and models write calls that lean on it, so this deviates from the shared
 * rule in `list-pairing.ts` on purpose. Don't fold it in without evidence from
 * an eval run that models don't depend on it.
 * @param color - The raw color param
 * @param index - The item's position in the call
 * @param parsedColors - The split colors, or null
 * @returns The color, or undefined when the call named none
 */
export function getColorForIndex(
  color: string | undefined,
  index: number,
  parsedColors: string[] | null,
): string | undefined {
  if (color == null) return undefined;
  if (parsedColors == null) return color;

  return parsedColors[index % parsedColors.length];
}
