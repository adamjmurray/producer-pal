// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
