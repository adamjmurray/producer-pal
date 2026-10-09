// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { replacementFailedDetail } from "#src/tools/shared/validation/lists/named-targets.ts";

/** The later entry an overridden one was left unwritten for, by position. */
export interface ReplacerAt {
  /** Position of the later entry in the list */
  index: number;
  /** The later entry, as the caller spelled it ("Gain", id 12) */
  by: string;
}

/**
 * Once every entry of a nested list has had its turn, fail the overridden ones
 * whose replacement landed nothing: they were not written through it after all.
 * Works from the last entry back, so a replacement that was itself failed this
 * way fails the entries before it too.
 * @param entries - One entry per item named, in order
 * @param replacers - For each overridden item, the later item meant to replace it
 * @param failed - Whether an entry is a failure (`ok: false`)
 * @param unwritten - Builds the failed entry from the overridden one and why
 * @returns The entries, each unreplaced one now a failure
 */
export function failUnreplacedEntries<T>(
  entries: T[],
  replacers: Map<number, ReplacerAt>,
  failed: (entry: T) => boolean,
  unwritten: (entry: T, detail: string) => T,
): T[] {
  const settled = [...entries];

  for (const index of [...replacers.keys()].toSorted((a, b) => b - a)) {
    const { index: later, by } = replacers.get(index) as ReplacerAt;

    if (failed(settled[later] as T)) {
      settled[index] = unwritten(
        settled[index] as T,
        replacementFailedDetail(by),
      );
    }
  }

  return settled;
}
