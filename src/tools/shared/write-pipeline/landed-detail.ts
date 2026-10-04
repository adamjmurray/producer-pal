// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The detail on a target whose write threw after part of it had landed: why
 * it stopped, and what the caller already has.
 * @param message - What the throw said
 * @param phrases - What had landed, in the order it did
 * @returns The detail
 */
export function landedDetail(message: string, phrases: string[]): string {
  return `${message}; already changed: ${phrases.join(", ")}`;
}
