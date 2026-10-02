// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Ask before deleting a collection entry. One wording for every collection,
 * whether the trash sits on the list row (memory) or in the editor footer
 * (custom skills).
 * @param noun - What the entry is called, e.g. "memory" or "custom skill"
 * @param name - The entry's slug
 * @returns Whether the user confirmed
 */
export function confirmEntryDelete(noun: string, name: string): boolean {
  return window.confirm(`Delete ${noun} "${name}"? This cannot be undone.`);
}
