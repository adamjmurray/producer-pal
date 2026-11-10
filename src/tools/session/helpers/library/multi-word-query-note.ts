// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The note an empty search carries when its `query` has several words. A query
 * is matched as one substring (of the name in Live's library, of the relative
 * path in the sample folder), but models write keyword lists, and an empty
 * answer doesn't tell them the shape was wrong.
 */

const MAX_WORD_LENGTH = 20;

/**
 * Explain the matching when a search with a multi-word query found nothing.
 *
 * @param query - The search's `query`
 * @param found - Matches before this page plus the page's items, so a page past
 *   the last match (which says nothing about the query) gets no note
 * @returns The note, or undefined when it doesn't apply
 */
export function multiWordQueryNote(
  query: string | undefined,
  found: number,
): string | undefined {
  if (query == null || found > 0 || !/\S\s+\S/.test(query)) {
    return undefined;
  }

  const example = joinWords(query);
  const between = example != null ? ` (${example})` : "";

  return `query matches as one substring, not keywords. Use * between words${between}, or tags/type for the rest.`;
}

/**
 * @param query - A query with whitespace between words
 * @returns The first two words joined by `*`, or undefined when there aren't
 *   two plain short ones to show
 */
function joinWords(query: string): string | undefined {
  const words = query
    .split(/\s+/)
    .map((word) => word.replaceAll("*", ""))
    .filter((word) => word !== "");

  if (words.length < 2) {
    return undefined;
  }

  const [first, second] = words as [string, string];

  if (first.length > MAX_WORD_LENGTH || second.length > MAX_WORD_LENGTH) {
    return undefined;
  }

  return `${first}*${second}`;
}
