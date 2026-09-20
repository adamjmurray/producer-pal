// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Any result entry that can carry a reason. */
export interface EntryWithReason {
  reason?: string;
}

/**
 * Add to what an entry says, keeping anything already on it.
 * @param entry - The target's entry in the result
 * @param reason - What to add
 */
export function appendReason(entry: EntryWithReason, reason: string): void {
  entry.reason = joinReasons([entry.reason, reason]);
}

/**
 * One entry's `reason` from every part of its turn that had something to say,
 * so a later one adds to the first instead of replacing it.
 * @param reasons - What each part had to say, in the order they should read
 * @returns The joined reason, or undefined when no part had one
 */
export function joinReasons(
  reasons: Array<string | undefined>,
): string | undefined {
  const said = reasons.filter((reason) => reason != null);

  return said.length === 0 ? undefined : said.join("; ");
}
