// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Formats a Unix timestamp for display in title attribute.
 * Uses locale-aware formatting for user's timezone.
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Locale-formatted date/time string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
