// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Failure text for the devices a check found: "none" only when there are none.
 *
 * @param names - Each device's name, "" when unnamed
 * @returns The names, quoted, with unnamed ones marked
 */
export function describeNames(names: string[]): string {
  if (names.length === 0) {
    return "none";
  }

  return names
    .map((name) => (name === "" ? "(unnamed)" : `"${name}"`))
    .join(", ");
}
