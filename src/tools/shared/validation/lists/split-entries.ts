// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// `\,` is a comma inside an entry; no other backslash is touched. No imports,
// so Node-side code can split a list the same way.

/**
 * Split a value at each comma not written as `\,`. A `\,` becomes a plain
 * comma inside its entry.
 * @param value - The raw param
 * @returns The untrimmed entries, one when the value has no separator
 */
export function splitEntries(value: string): string[] {
  const entries: string[] = [];

  for (const piece of value.split(",")) {
    const last = entries.at(-1);

    if (last?.endsWith("\\") === true) {
      entries[entries.length - 1] = `${last.slice(0, -1)},${piece}`;
    } else {
      entries.push(piece);
    }
  }

  return entries;
}

/**
 * Read each `\,` in a whole value as a plain comma.
 * @param value - The raw param
 * @returns The value with its escaped commas unescaped
 */
export function unescapeCommas(value: string): string {
  return value.replaceAll("\\,", ",");
}
