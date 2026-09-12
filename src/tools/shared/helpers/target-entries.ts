// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Splits a target list — a param naming objects or places (`id`, `path`,
 * `toPath`, `arrangementStart`, `locator`) — into its entries, refusing a list
 * it can't read cleanly.
 *
 * One trailing comma is not an entry, the way most languages read a list
 * literal. Any other empty entry is a hole, and a hole is refused rather than
 * guessed at: dropping it shifts every later pairing, keeping it names nothing,
 * and which of the two bites depends on params the caller isn't looking at. A
 * list whose entries are all empty (`","`) names nothing, and is the same error.
 *
 * Refusing is safe here because nothing has run yet — the model retries with a
 * corrected call and loses no work. Value lists refuse a hole too, in
 * `splitList`.
 * @param raw - The param's value, or nullish when it was omitted
 * @param label - Param name, for the error message
 * @returns One trimmed entry per target, in order; empty only when omitted
 * @throws Error when the list has a hole or names nothing
 */
export function targetEntries(
  raw: string | null | undefined,
  label: string,
): string[] {
  return entriesFrom(raw, (value) => value.split(","), label);
}

/**
 * {@link targetEntries} over a caller-supplied split, so a param whose entries
 * can contain a comma splits its own way and still gets one hole rule.
 * @param raw - The param as the caller sent it
 * @param split - How to cut the value into entries
 * @param label - Param name for error messages
 * @returns One trimmed entry per target, in order
 */
export function entriesFrom(
  raw: string | null | undefined,
  split: (value: string) => string[],
  label: string,
): string[] {
  // A blank value is an unsent param (ADR-0029), not a list that names nothing.
  // A lone comma is something the caller typed, and that is the error below.
  if (raw == null || raw.trim() === "") {
    return [];
  }

  const entries = split(raw).map((entry) => entry.trim());

  if (entries.at(-1) === "") {
    entries.pop();
  }

  if (entries.every((entry) => entry === "")) {
    throw new Error(`invalid ${label} "${raw}" - it names nothing`);
  }

  if (entries.includes("")) {
    throw new Error(
      `invalid ${label} "${raw}" - it has an empty entry. ` +
        `Drop the extra comma, or name every target.`,
    );
  }

  return entries;
}

/**
 * Unwraps a single-element array to its element, otherwise returns the array
 * Used for tool results that should return a single object when one item,
 * or an array when multiple items.
 * @param array - Array of results
 * @returns Single element if array has one item, otherwise the full array
 */
export function unwrapSingleResult<T>(array: T[]): T | T[] {
  return array.length === 1 ? (array[0] as T) : array;
}
