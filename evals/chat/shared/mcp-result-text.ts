// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared unwrapping of MCP tool results into display text, so every eval
 * transport shows (and grades) the same string for the same tool call.
 *
 * A Producer Pal result is the payload in block 0 followed by one block per
 * relayed `console.warn` (see `src/mcp-server/max-api-adapter.ts`). The two are
 * read separately on purpose: the payload has to stay parseable on its own —
 * scenario assertions run `parseToolResult` over it — so warnings are collected
 * as their own list rather than concatenated onto the end of it.
 */

/** Prefix `max-api-adapter.ts` puts on every relayed `console.warn`. */
const WARNING_PREFIX = "WARNING:";

/**
 * Extract the payload (first text block) from an MCP tool result.
 *
 * Accepts both shapes the transports see: the AI SDK hands over `result.content`
 * (a bare array of content blocks) while the Codex CLI reports the whole
 * envelope (`{ content: [...] }`).
 *
 * @param value - Raw MCP result, or its content array
 * @returns The first text block, or "" when the value carries none
 */
export function mcpResultText(value: unknown): string {
  const first = contentBlocks(value)[0];

  return typeof first?.text === "string" ? first.text : "";
}

/**
 * Extract the relayed `WARNING:` blocks from an MCP tool result.
 *
 * `console.warn` is the project's warn-and-skip signal — an update tool that
 * refuses an operation says so here and nowhere else — so an eval that grades
 * whether the engine accepted a call has to read these, not just the payload.
 *
 * @param value - Raw MCP result, or its content array
 * @returns Every `WARNING:`-prefixed text block, in order; empty when there are none
 */
export function mcpResultWarnings(value: unknown): string[] {
  return contentBlocks(value)
    .map((block) => block.text)
    .filter(
      (text): text is string =>
        typeof text === "string" && text.startsWith(WARNING_PREFIX),
    );
}

/**
 * Normalize either accepted shape down to the content-block array.
 *
 * @param value - Raw MCP result, or its content array
 * @returns The content blocks, or [] when the value carries none
 */
function contentBlocks(value: unknown): Array<{ text?: unknown }> {
  const blocks = Array.isArray(value)
    ? value
    : (value as { content?: unknown } | null | undefined)?.content;

  return Array.isArray(blocks) ? (blocks as Array<{ text?: unknown }>) : [];
}
