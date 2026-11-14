// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Helpers for extracting warning messages from raw tool call results.
 */

import { getWarningTexts, WARNING_PREFIX } from "#src/shared/mcp-responses";

/**
 * Extract warning messages from a raw tool result string.
 *
 * Parses the MCP content array and finds text items prefixed with "WARNING: ".
 *
 * @param result - Raw tool result string (JSON-serialized MCP content array)
 * @returns Array of cleaned warning messages (prefix stripped), empty if none
 */
export function extractWarnings(result: string): string[] {
  if (!result.startsWith("[")) {
    return [];
  }

  try {
    return getWarningTexts(JSON.parse(result)).map((text) =>
      text.slice(WARNING_PREFIX.length),
    );
  } catch {
    return [];
  }
}
