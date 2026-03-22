// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Run ID generation for eval result persistence
 */

/**
 * Generate a unique run ID from the current timestamp.
 * Format: "2026-03-22T10-30-00Z" (ISO 8601 with colons replaced by dashes)
 *
 * @returns Run ID string
 */
export function generateRunId(): string {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "Z");
}
