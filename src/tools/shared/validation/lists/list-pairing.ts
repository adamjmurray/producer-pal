// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// One rule for every comma-separated list a tool pairs against the items it
// acts on: one value covers them all, or exactly N pair 1:1 in order, and no
// entry may be empty. A length mismatch is refused before any work runs, and a
// hole is refused here. Nothing cycles — a caller can't predict where a cycled
// value lands.
//
// Destinations are the exception, in one direction only: a clip slot holds one
// clip, so broadcasting a lone slot to three clips would destroy two of them.
// Those pair exactly (pairExact). Values broadcast (pairValues, valueForIndex)
// because an arrangement position holds any number of clips, and a name or a
// color is a property, not a place.

import * as console from "#src/shared/max/v8-max-console.ts";

/** How a mismatched list is described in the warning. */
export interface PairLabels {
  /** The param the caller sent, e.g. "toPath". */
  param: string;
  /** What one entry names, singular: "name", "destination", "position". */
  noun: string;
  /** What the call acts on, singular: "clip", "track", "scene". */
  item: string;
  /** What the items past the last entry get instead. */
  shortfall: string;
}

/** The entries of a value list, one per item. */
export type ListEntries = string[];

/**
 * Split a comma-separated param into one entry per item.
 *
 * Returns null when there's nothing to pair — a single item, or a value with
 * no comma in it — which the index lookups read as "this value covers
 * everything".
 * @param value - The raw param, as the caller sent it
 * @param count - How many items the call acts on
 * @param param - The param's name, for the error message
 * @returns The entries, or null when the whole value applies to every item
 * @throws Error when an entry inside the list is empty
 */
export function splitList(
  value: string | undefined,
  count: number,
  param: string,
): ListEntries | null {
  if (count <= 1 || !value?.includes(",")) {
    return null;
  }

  const entries = value.split(",").map((v) => v.trim());

  // One trailing comma isn't an entry, the way most languages read a list
  // literal. Without this, "A,B," over three items clears the third name.
  if (entries.at(-1) === "") entries.pop();

  // A gap has two readings — a stray comma, or a value that went missing — and
  // nothing in the call says which. Clearing one item's value inside a list was
  // never possible either way: `${param}: ""` clears it for the whole call.
  if (entries.includes("")) {
    throw new Error(
      `invalid ${param} "${value}" - it has an empty entry. Drop the extra ` +
        `comma, or give every item a value.`,
    );
  }

  return entries;
}

/**
 * The value for one item: the whole param when the call named one, else the
 * entry in that position.
 * @param value - The raw param, as the caller sent it
 * @param index - The item's position in the call
 * @param parsed - The split entries, or null when the value covers every item
 * @returns The value, or undefined when the list ran out before this item
 */
export function valueForIndex(
  value: string | undefined,
  index: number,
  parsed: ListEntries | null,
): string | undefined {
  if (value == null) return undefined;

  // A list too short for the items is refused up front, so past the last entry
  // only happens where nothing checked — and there the item keeps what it had.
  return parsed == null ? value : parsed[index];
}

/**
 * Pair a list of parsed values with the items, broadcasting a lone value.
 * @param values - The parsed values, in call order
 * @param count - How many items the call acts on
 * @param labels - What to call the param and its entries in a warning
 * @returns Exactly count entries, padded with null
 */
export function pairValues<T>(
  values: Array<T | null>,
  count: number,
  labels: PairLabels,
): Array<T | null> {
  const single = values.length === 1 ? (values[0] ?? null) : null;

  if (single != null) return Array.from({ length: count }, () => single);

  return pairExact(values, count, labels);
}

/**
 * Pair a list with the items 1:1, warning when the counts disagree.
 *
 * Use this for destinations that hold one item each: broadcasting there would
 * put every item in the same place, and each one would overwrite the last.
 * @param values - The parsed values, in call order
 * @param count - How many items the call acts on
 * @param labels - What to call the param and its entries in a warning
 * @returns Exactly count entries, padded with null
 */
export function pairExact<T>(
  values: Array<T | null>,
  count: number,
  labels: PairLabels,
): Array<T | null> {
  warnPairingMismatch(values.length, count, labels);

  return Array.from({ length: count }, (_unused, i) => values[i] ?? null);
}

/**
 * Warn when a list named a different number of entries than there are items.
 *
 * Silent when the counts match, or when the call named nothing to pair.
 * @param provided - How many entries the list has
 * @param count - How many items the call acts on
 * @param labels - What to call the param and its entries
 */
export function warnPairingMismatch(
  provided: number,
  count: number,
  labels: PairLabels,
): void {
  if (provided === count || provided === 0) return;

  const { param, noun, item, shortfall } = labels;
  const head = `${param}: ${plural(provided, noun)} for ${plural(count, item)}`;

  console.warn(
    provided > count
      ? `${head}; the extra ${noun}s went unused`
      : `${head}; the ${item}s past the last ${noun} ${shortfall}`,
  );
}

/**
 * "1 name", "3 names" — every noun the pairing labels use takes a plain -s.
 * @param count - How many
 * @param noun - The singular noun
 * @returns The counted phrase
 */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
