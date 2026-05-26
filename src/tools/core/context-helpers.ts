// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export interface MemoryResult {
  enabled: boolean;
  writable?: boolean;
  content?: string;
}

/**
 * Handle read action
 * @param context - The context object
 * @returns Memory result with enabled status and content
 */
export function handleReadMemory(
  context: Partial<ToolContext> = {},
): MemoryResult {
  const memory = context.memory;

  if (!memory?.enabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    writable: memory.writable,
    content: memory.content,
  };
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
  const memory = context.memory;

  if (!memory?.enabled) {
    throw new Error("Project context is disabled");
  }

  if (!memory.writable) {
    throw new Error(
      "AI updates are disabled - enable 'AI can edit memory' on the Context screen to let AI modify project context",
    );
  }

  if (!content) {
    throw new Error("Content required for write action");
  }

  memory.content = content;

  // Send update to Max patch via outlet
  outlet(0, "update_memory", content);

  return {
    enabled: true,
    writable: memory.writable,
    content: memory.content,
  };
}
