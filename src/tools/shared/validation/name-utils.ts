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
 * Parse a comma-separated name param and warn when it names the wrong number.
 *
 * One name covers every item; a list pairs 1:1 in order. See `list-pairing.ts`
 * for why nothing cycles.
 * @param value - The raw name param
 * @param count - How many items the call names
 * @param item - What the call acts on, singular ("clip", "track")
 * @returns One name per item, or null when the value covers every item
 */
export function parseNames(
  value: string | undefined,
  count: number,
  item: string,
): ListEntries | null {
  const parsed = splitList(value, count);

  warnPairingMismatch(parsed?.length ?? 0, count, {
    param: "name",
    noun: "name",
    item,
    shortfall: "were not renamed",
  });

  return parsed;
}

/**
 * The name for one item, or undefined when the call named none for it.
 * @param value - The raw name param
 * @param index - The item's position in the call
 * @param parsed - The split names, or null
 * @returns The name, or undefined
 */
export function getNameForIndex(
  value: string | undefined,
  index: number,
  parsed: ListEntries | null,
): string | undefined {
  return valueForIndex(value, index, parsed);
}

/**
 * Live prepends a return slot's send letter to its name, so writing back the
 * name a read tool reported ("A-Delay", "F Pedal") would double it. Strip a
 * leading letter when it matches the slot's own index.
 * @param path - The slot's Live API path
 * @param name - Requested name
 * @param slotPattern - Regex capturing the slot index at the end of the path
 * @param separator - What Live puts between the letter and the name
 * @returns Name to write
 */
export function stripReturnSlotLetter(
  path: string,
  name: string,
  slotPattern: RegExp,
  separator: string,
): string {
  const match = slotPattern.exec(path);

  if (match == null) {
    return name;
  }

  const index = Number(match[1]);

  // Past Z we don't know what Live labels the slot, so leave the name alone.
  if (index > 25) {
    return name;
  }

  const prefix = `${String.fromCharCode(65 + index)}${separator}`;

  return name.toUpperCase().startsWith(prefix)
    ? name.slice(prefix.length)
    : name;
}
