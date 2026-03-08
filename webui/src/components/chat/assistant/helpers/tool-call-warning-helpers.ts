// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Helpers for extracting warning messages from raw tool call results.
 */

const WARNING_PREFIX = /^warning:\s*/i;

/**
 * Extract warning messages from a raw tool result string.
 *
 * Parses the MCP content array and finds text items prefixed with "WARNING:".
 *
 * @param result - Raw tool result string (JSON-serialized MCP content array)
 * @returns Array of cleaned warning messages (prefix stripped), empty if none
 */
export function extractWarnings(result: string): string[] {
  if (!result.startsWith("[")) return [];

  try {
    const arr = JSON.parse(result) as Array<{ type: string; text?: string }>;

    return arr
      .filter(
        (item): item is { type: string; text: string } =>
          item.type === "text" &&
          typeof item.text === "string" &&
          WARNING_PREFIX.test(item.text),
      )
      .map((item) => item.text.replace(WARNING_PREFIX, ""));
  } catch {
    return [];
  }
}
