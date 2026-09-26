// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * How a result names the objects a call made on the way to what it was asked
 * for — the scenes, chains or take lanes that had to exist first. One spelling
 * for all of them, so `created` reads the same wherever it turns up.
 * @param prefix - The path letter for this kind of object ("s", "c", "l")
 * @param first - The first index created
 * @param last - The last index created
 * @returns "s8" for one, "s8-s9" for a run
 */
export function createdRange(
  prefix: string,
  first: number,
  last: number,
): string {
  return first === last
    ? `${prefix}${first}`
    : `${prefix}${first}-${prefix}${last}`;
}

/**
 * How many objects some {@link createdRange} spellings name in all.
 * @param ranges - e.g. ["s8", "s10-s12"]
 * @returns The count
 */
export function createdCount(ranges: readonly string[]): number {
  return ranges.reduce((sum, range) => {
    const [first = 0, last = first] = range
      .split("-")
      .map((end) => Number(end.replace(/^\D+/, "")));

    return sum + last - first + 1;
  }, 0);
}
