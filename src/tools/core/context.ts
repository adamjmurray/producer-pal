// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type MemoryResult,
  handleReadMemory,
  handleWriteMemory,
} from "./context-helpers.ts";

interface ContextArgs {
  action?: string;
  content?: string;
}

/**
 * Project memory tool for Producer Pal (read/write).
 *
 * Sample search lives in `ppal-library` now (which surfaces both Live's
 * browser DB and the user-configured sampleFolder).
 *
 * @param args - The parameters
 * @param args.action - Action to perform (read, write)
 * @param args.content - Memory content (required for write)
 * @param toolContext - The context object
 * @returns Memory result
 */
export function context(
  { action, content }: ContextArgs = {},
  toolContext: Partial<ToolContext> = {},
): MemoryResult {
  switch (action) {
    case "read":
      return handleReadMemory(toolContext);
    case "write":
      return handleWriteMemory(content, toolContext);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
