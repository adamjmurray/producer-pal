// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared unwrapping of MCP tool results into display text, so every eval
 * transport shows (and grades) the same string for the same tool call.
 */

/**
 * Extract the first text block from an MCP tool result.
 *
 * Accepts both shapes the transports see: the AI SDK hands over `result.content`
 * (a bare array of content blocks) while the Codex CLI reports the whole
 * envelope (`{ content: [...] }`).
 *
 * @param value - Raw MCP result, or its content array
 * @returns The first text block, or "" when the value carries none
 */
export function mcpResultText(value: unknown): string {
  const blocks = Array.isArray(value)
    ? value
    : (value as { content?: unknown } | null | undefined)?.content;

  if (!Array.isArray(blocks)) return "";

  const first = blocks[0] as { text?: unknown } | undefined;

  return typeof first?.text === "string" ? first.text : "";
}
