// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { splitPathEntries } from "#src/tools/shared/validation/helpers/object-path-lexer.ts";

/**
 * The whole-call check that two comma-separated params agree on how many
 * entries they name.
 *
 * Each param splits itself, and by the time one is split nothing knows whether
 * another is even a list — so this runs first, on the raw args, before any work
 * starts.
 */

/** One list param, as the caller sent it. */
export interface ListArg {
  /** The param name, for the error message. */
  param: string;
  value?: string | null | undefined;
  /**
   * An entry count worked out elsewhere, for a target list that isn't one
   * param. update-clip's `id` and `path` name different clips and combine, so
   * neither one's length is the number of clips — and comparing them to each
   * other would refuse a call naming two of each.
   */
  count?: number;
  /** What this arg counts, when "entries" doesn't fit: "track", "copy". */
  noun?: string;
  /**
   * A path param, whose entries split at bracket depth 0 — a `[...]`
   * coordinate can hold a comma, in a locator name or a bar|beat offset.
   */
  isPath?: boolean;
}

/**
 * Refuse a call whose comma-separated params name different numbers of entries.
 *
 * A param naming one entry covers every item and never conflicts, so only lists
 * of 2 or more are compared. Between two real lists a length mismatch has no
 * reading that isn't a mistake: the shorter one leaves items unset and the
 * longer one names items that aren't there. Nothing has run yet, so the model
 * retries with a corrected call and loses no work.
 * @param args - The list params this call accepts, in the order to report them
 * @throws Error when two comma-bearing params name different counts
 */
export function validateListLengths(args: ListArg[]): void {
  const lists = args
    .map((arg) => ({
      param: arg.param,
      noun: arg.noun ?? "entry",
      count: entryCount(arg),
      isList: isList(arg),
    }))
    .filter((list) => list.isList);

  const first = lists[0];

  if (first == null) return;

  const odd = lists.find((list) => list.count !== first.count);

  if (odd == null) return;

  throw new Error(
    `${first.param} names ${plural(first.count, first.noun)} but ` +
      `${odd.param} names ${plural(odd.count, odd.noun)}. Comma-separated ` +
      `params must name the same number of entries, or one value that ` +
      `covers them all.`,
  );
}

/**
 * Refuse two already-split lists that pair 1:1 but name different counts.
 *
 * For the lists a whole-call check can't reach: duplicate shares its
 * destinations out across the sources first, so the counts that have to agree
 * are the per-source ones, not the raw params. Still pre-flight — it runs while
 * the copies are being planned, before any is made.
 * @param a - The first list's param name and entry count
 * @param b - The second list's param name and entry count
 * @throws Error when both name more than one entry and the counts differ
 */
export function requireSameLength(
  a: { param: string; count: number },
  b: { param: string; count: number },
): void {
  if (a.count <= 1 || b.count <= 1 || a.count === b.count) return;

  throw new Error(
    `${a.param} names ${plural(a.count, "entry")} but ${b.param} names ` +
      `${plural(b.count, "entry")}. Comma-separated params must name the ` +
      `same number of entries, or one value that covers them all.`,
  );
}

/**
 * Whether an arg is a list at all. A value with no comma in it covers every
 * item and never conflicts. One with a comma is a list even when a trailing
 * comma leaves it a single entry — "A," against two items is a short list, not
 * one value covering both.
 * @param arg - The list param
 * @returns True when the arg has to agree with the other lists
 */
function isList(arg: ListArg): boolean {
  if (arg.count != null) return arg.count > 1;
  if (arg.value == null) return false;

  // A comma makes it a list even when it names one entry — "A," is a malformed
  // list, and dropping it here would let it pass unchallenged. A path's comma
  // has to be at bracket depth 0 to count.
  return arg.isPath
    ? splitPathEntries(arg.value).length > 1
    : arg.value.includes(",");
}

/**
 * How many entries one arg names. A value with no comma in it is one value
 * covering every item, which never conflicts, so it counts as 1 and drops out.
 * @param arg - The list param
 * @returns The entry count
 */
function entryCount(arg: ListArg): number {
  if (arg.count != null) return arg.count;

  return arg.value == null ? 1 : countEntries(arg.value, arg.isPath);
}

/**
 * How many entries a comma-separated value names, reading one trailing comma
 * as a typo rather than an entry — the same way both splitters do. An unset
 * value names none.
 * @param value - The raw param value
 * @returns The entry count
 */
export function countListEntries(value: string | null | undefined): number {
  return value == null || value.trim() === "" ? 0 : countEntries(value);
}

/**
 * {@link countListEntries} for a path param, whose entries split at bracket
 * depth 0 — a `[...]` coordinate can hold a comma.
 * @param value - The raw path param value
 * @returns The entry count
 */
export function countPathEntries(value: string | null | undefined): number {
  return value == null || value.trim() === "" ? 0 : countEntries(value, true);
}

/**
 * How many entries a comma-separated value names, reading one trailing comma
 * as a typo rather than an entry — the same way both splitters do.
 * @param value - The raw param value
 * @param isPath - Split at bracket depth 0, for a path param
 * @returns The entry count
 */
function countEntries(value: string, isPath = false): number {
  const entries = isPath ? splitPathEntries(value) : value.split(",");

  if ((entries.at(-1) ?? "").trim() === "") entries.pop();

  return entries.length;
}

/**
 * "1 entry", "3 copies", "2 tracks" — a trailing y becomes -ies.
 * @param count - How many
 * @param noun - The singular noun
 * @returns The counted phrase
 */
function plural(count: number, noun: string): string {
  if (count === 1) return `${count} ${noun}`;

  const plur = noun.endsWith("y") ? `${noun.slice(0, -1)}ies` : `${noun}s`;

  return `${count} ${plur}`;
}
