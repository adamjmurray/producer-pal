// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Extract and join text content from an MCP content array, dropping non-text
 * items (images, etc.). Shared by the chat tool bridge and both voice bridges,
 * which all flatten MCP results the same way.
 *
 * @param content - MCP content items
 * @returns Concatenated text from all text content items
 */
export function extractMcpText(
  content: Array<{ type: string; text?: string }>,
): string {
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}
