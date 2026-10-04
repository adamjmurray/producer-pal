// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Finding devices in what a read produced, for the passes that add detail only
// the remote script has.

/**
 * Every object under a read result that matches, nested ones included.
 * @param node - A read result, or any part of one
 * @param isMatch - Whether an object is one to find
 * @returns The matches, outermost first
 */
export function findInReadResult<T extends object>(
  node: unknown,
  isMatch: (record: object) => record is T,
): T[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => findInReadResult(item, isMatch));
  }

  if (node == null || typeof node !== "object") {
    return [];
  }

  const own = isMatch(node) ? [node] : [];

  return [
    ...own,
    ...Object.values(node).flatMap((value) => findInReadResult(value, isMatch)),
  ];
}
