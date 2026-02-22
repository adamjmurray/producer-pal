// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared utilities for message formatters.
 */
import { type UIMessage, type UIPart } from "#webui/types/messages";

/**
 * Mark the last thought part as open if it exists.
 * Used to show activity indicator on the most recent thinking.
 * @param messages - Messages array to modify
 */
export function markLastThoughtAsOpen(messages: UIMessage[]): void {
  const lastMessage = messages.at(-1);

  if (!lastMessage) return;
  const lastPart = lastMessage.parts.at(-1);

  if (lastPart?.type === "thought") {
    lastPart.isOpen = true;
  }
}

/**
 * Detect error indicators in a tool result string using heuristic matching
 * @param result - Tool result string to check
 * @returns True if result contains error indicators
 */
export function isErrorResult(result: string): boolean {
  return result.includes('"error"') || result.includes('"isError":true');
}

/**
 * Add text content to parts, merging with previous text part if consecutive
 * @param parts - Parts array to modify
 * @param content - Text content to add
 */
export function addTextContent(parts: UIPart[], content: string): void {
  if (!content) return;
  const lastPart = parts.at(-1);

  if (lastPart?.type === "text") {
    lastPart.content += content;
  } else {
    parts.push({ type: "text", content });
  }
}
