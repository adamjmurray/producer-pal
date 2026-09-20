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
  entry.reason = entry.reason == null ? reason : `${entry.reason}; ${reason}`;
}
