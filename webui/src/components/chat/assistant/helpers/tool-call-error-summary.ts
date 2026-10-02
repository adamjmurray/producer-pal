// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Helpers for extracting clean error messages from raw tool call results.
 */

/**
 * Extract a clean, human-readable error summary from a raw tool result string.
 *
 * Handles these formats (in priority order):
 * 1. `Error: message` prefix
 * 2. `Tool call '...' timed out after Nms` prefix
 * 3. `MCP error -NNNNN: message` prefix (with optional `Input validation error:` sub-prefix)
 *
 * @param result - Raw tool result string
 * @returns Clean error message, or null if no pattern matched
 */
export function extractErrorSummary(result: string): string | null {
  const text = unquoteJsonString(result);

  return (
    stripErrorPrefix(text) ??
    stripTimeoutPrefix(text) ??
    stripMcpErrorPrefix(text)
  );
}

/**
 * If the string is a JSON-stringified string (starts with `"`), unwrap it.
 * @param s - Possibly JSON-quoted string
 * @returns Unwrapped string, or original if not a JSON string
 */
function unquoteJsonString(s: string): string {
  if (!s.startsWith('"')) {
    return s;
  }

  try {
    const parsed: unknown = JSON.parse(s);

    return typeof parsed === "string" ? parsed : s;
  } catch {
    return s;
  }
}

/**
 * Strip the `Error: ` prefix a failed tool result carries.
 * @param s - Error message string
 * @returns Message after prefix, or null
 */
function stripErrorPrefix(s: string): string | null {
  const match = s.match(/^Error: (.+)$/s);

  return match?.[1] ?? null;
}

/**
 * Strip `Tool call '...' ` prefix from timeout messages.
 * @param s - Error message string
 * @returns Message after prefix, or null
 */
function stripTimeoutPrefix(s: string): string | null {
  const match = s.match(/^Tool call '[^']+' (timed out.+)$/s);

  return match?.[1] ?? null;
}

/**
 * Strip `MCP error -NNNNN: ` prefix, and optional `Input validation error: ` sub-prefix.
 * @param s - Error message string
 * @returns Message after prefix(es), or null
 */
function stripMcpErrorPrefix(s: string): string | null {
  const match = s.match(/^MCP error -\d+: (.+)$/s);

  if (!match?.[1]) {
    return null;
  }

  const msg = match[1];

  if (msg.startsWith("Input validation error: ")) {
    return "Invalid arguments";
  }

  return msg;
}
