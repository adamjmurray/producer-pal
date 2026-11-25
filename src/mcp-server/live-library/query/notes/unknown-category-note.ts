// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The note a list-plugins call carries when a category or subcategory filter
 * left out plug-ins whose category is unknown (not in Live's plugin DB). They
 * can't match the filter, and without the note the caller can't tell they exist.
 */

/**
 * Say how many plug-ins a category or subcategory filter left out because their
 * category is unknown.
 *
 * @param count - Number of plug-ins left out
 * @returns The note, or undefined when none were
 */
export function unknownCategoryNote(count: number): string | undefined {
  if (count === 0) {
    return undefined;
  }

  const plugins = count === 1 ? "1 plug-in" : `${count} plug-ins`;

  return `${plugins} with an unknown category ${count === 1 ? "was" : "were"} left out. Drop deviceKind/subcategory to list ${count === 1 ? "it" : "them"}.`;
}
