// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export interface MemoryResult {
  content: string;
}

/**
 * Handle read action
 * @param context - The context object
 * @returns Memory result with content
 */
export function handleReadMemory(
  context: Partial<ToolContext> = {},
): MemoryResult {
  return { content: context.memory?.content ?? "" };
}

/**
 * Handle write action
 * @param content - Memory content to write
 * @param context - The context object
 * @returns Memory result with updated content
 */
export function handleWriteMemory(
  content: string | undefined,
  context: Partial<ToolContext> = {},
): MemoryResult {
  if (!content) {
    throw new Error("Content required for write action");
  }

  const memory = context.memory;

  if (memory) {
    memory.content = content;
  }

  // Send update to Max patch via outlet
  outlet(0, "update_memory", content);

  return { content };
}
