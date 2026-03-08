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
 * 1. MCP content array with `error` field in inner JSON
 * 2. `Error executing tool '...': message` prefix
 * 3. `Tool call '...' timed out after Nms` prefix
 * 4. `MCP error -NNNNN: message` prefix (with optional `Input validation error:` sub-prefix)
 *
 * @param result - Raw tool result string
 * @returns Clean error message, or null if no pattern matched
 */
export function extractErrorSummary(result: string): string | null {
  const text = unquoteJsonString(result);

  return (
    extractMcpContentError(text) ??
    stripToolErrorPrefix(text) ??
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
  if (!s.startsWith('"')) return s;

  try {
    const parsed: unknown = JSON.parse(s);

    return typeof parsed === "string" ? parsed : s;
  } catch {
    return s;
  }
}

/**
 * Extract error message from MCP content array format.
 * Parses `[{"type":"text","text":"{\"error\":\"...\"}"}]` and returns the error value.
 * @param s - Possibly MCP content array string
 * @returns Error message or null
 */
function extractMcpContentError(s: string): string | null {
  if (!s.startsWith("[")) return null;

  try {
    const arr = JSON.parse(s) as Array<{ type: string; text?: string }>;
    const firstText = arr.find((item) => item.type === "text")?.text;

    if (!firstText) return null;
    const inner = JSON.parse(firstText) as Record<string, unknown>;

    return typeof inner.error === "string" ? inner.error : null;
  } catch {
    return null;
  }
}

/**
 * Strip `Error executing tool '...': ` prefix.
 * @param s - Error message string
 * @returns Message after prefix, or null
 */
function stripToolErrorPrefix(s: string): string | null {
  const match = s.match(/^Error executing tool '[^']+': (.+)$/s);

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

  if (!match?.[1]) return null;
  const msg = match[1];

  if (msg.startsWith("Input validation error: ")) {
    return "Invalid arguments";
  }

  return msg;
}
