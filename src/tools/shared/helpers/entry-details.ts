// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A nested entry (a param, send or action) a later one overrides is marked with
// a hidden symbol, so "did anything land" reads the mark and never the detail's
// wording. The mark is non-enumerable, so JSON, equality checks and a spread
// ignore it, and a copy of the entry loses it: read it before copying.
const SUPERSEDED = Symbol("superseded");
// The later entry an overridden one was meant to be replaced by, so its fate
// can be checked once every entry has landed or failed.
const REPLACER = Symbol("replacer");

/** The later entry that was to replace an overridden one, and how to name it. */
export interface Replacer {
  entry: object;
  by: string;
}

/** Any result entry that can carry a detail. */
export interface EntryWithDetail {
  detail?: string;
}

/**
 * Add to what an entry says, keeping anything already on it.
 * @param entry - The target's entry in the result
 * @param detail - What to add
 */
export function appendDetail(entry: EntryWithDetail, detail: string): void {
  entry.detail = joinDetails([entry.detail, detail]);
}

/**
 * One entry's `detail` from every part of its turn that had something to say,
 * so a later one adds to the first instead of replacing it.
 * @param details - What each part had to say, in the order they should read
 * @returns The joined detail, or undefined when no part had one
 */
export function joinDetails(
  details: Array<string | undefined>,
): string | undefined {
  const said = details.filter((detail) => detail != null);

  return said.length === 0 ? undefined : said.join("; ");
}

/**
 * Mark an entry as overridden by a later one.
 * @param entry - The entry to mark, changed in place
 * @returns The same entry
 */
export function markSuperseded<T extends object>(entry: T): T {
  Object.defineProperty(entry, SUPERSEDED, { value: true });

  return entry;
}

/**
 * Whether an entry was marked as overridden by a later one.
 * @param entry - Any nested entry
 * @returns True for a marked entry
 */
export function isSuperseded(entry: object): boolean {
  return (entry as { [SUPERSEDED]?: true })[SUPERSEDED] === true;
}

/**
 * Say which later entry an overridden entry was left unwritten for.
 * @param entry - The overridden entry, changed in place
 * @param replacer - The later entry and how to name it
 */
export function linkReplacer(entry: object, replacer: Replacer): void {
  Object.defineProperty(entry, REPLACER, { value: replacer });
}

/**
 * The later entry an overridden entry was left unwritten for.
 * @param entry - Any nested entry
 * @returns The later entry, or undefined when none was linked
 */
export function replacerOf(entry: object): Replacer | undefined {
  return (entry as { [REPLACER]?: Replacer })[REPLACER];
}
