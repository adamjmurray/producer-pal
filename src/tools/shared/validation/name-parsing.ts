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
  const parsed = splitList(value, count, "name");

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
 * The send letter Live labels a return slot with.
 * @param path - The slot's Live API path
 * @param slotPattern - Regex capturing the slot index at the end of the path
 * @returns The letter, or null when the path names no return slot or the slot
 *   is past Z, where Live's label is unknown
 */
export function returnSlotLetter(
  path: string,
  slotPattern: RegExp,
): string | null {
  const match = slotPattern.exec(path);

  if (match == null) {
    return null;
  }

  const index = Number(match[1]);

  return index > 25 ? null : String.fromCharCode(65 + index);
}

/**
 * Live prepends a return slot's send letter to its name, so writing back the
 * name a read tool reported ("A-Delay", "F Pedal") would double it. Strip a
 * leading "<letter><separator>", case-insensitively, but only when the letter
 * is the slot's own: "B-Side" on return C is a name, not a doubled prefix.
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
  const letter = returnSlotLetter(path, slotPattern);

  if (letter == null) {
    return name;
  }

  const prefix = `${letter}${separator}`;

  return name.toUpperCase().startsWith(prefix)
    ? name.slice(prefix.length)
    : name;
}
