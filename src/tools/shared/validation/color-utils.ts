// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ListEntries,
  splitList,
  valueForIndex,
  warnPairingMismatch,
} from "#src/tools/shared/validation/lists/list-pairing.ts";

/**
 * Parse a comma-separated color param and warn when it names the wrong number.
 *
 * One color covers every item; a list pairs 1:1 in order. See `list-pairing.ts`
 * for why nothing cycles.
 * @param value - The raw color param
 * @param count - How many items the call acts on
 * @param item - What the call acts on, singular ("clip", "track")
 * @returns One color per item, or null when the value covers every item
 */
export function parseColors(
  value: string | undefined,
  count: number,
  item: string,
): ListEntries | null {
  const parsed = splitList(value, count);

  warnPairingMismatch(parsed?.length ?? 0, count, {
    param: "color",
    noun: "color",
    item,
    shortfall: "were not recolored",
  });

  return parsed;
}

/**
 * The color for one item, or undefined when the call named none for it.
 * @param color - The raw color param
 * @param index - The item's position in the call
 * @param parsedColors - The split colors, or null
 * @returns The color, or undefined
 */
export function getColorForIndex(
  color: string | undefined,
  index: number,
  parsedColors: ListEntries | null,
): string | undefined {
  return valueForIndex(color, index, parsedColors);
}
