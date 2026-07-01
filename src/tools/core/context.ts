// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type MemoryResult,
  handleReadGlobalMemory,
  handleReadMemory,
  handleWriteGlobalMemory,
  handleWriteMemory,
} from "./context-helpers.ts";

interface ContextArgs {
  action?: string;
  content?: string;
  scope?: string;
}

/**
 * Context/memory tool for Producer Pal (read/write), across two scopes:
 *  - project (default): this Live Set's context, held by the Max device.
 *  - global: machine-wide user facts in ~/.producer-pal/context.md, shared by
 *    every project and client. V8 has no filesystem, so the global scope
 *    round-trips to the Node side over the RPC bridge.
 *
 * Sample search lives in `ppal-library` now (which surfaces both Live's
 * browser DB and the user-configured sampleFolder).
 *
 * @param args - The parameters
 * @param args.action - Action to perform (read, write)
 * @param args.content - Memory content (required for write)
 * @param args.scope - Which context to target (project | global; default project)
 * @param toolContext - The context object
 * @returns Memory result
 */
export async function context(
  { action, content, scope }: ContextArgs = {},
  toolContext: Partial<ToolContext> = {},
): Promise<MemoryResult> {
  if (scope === "global") {
    switch (action) {
      case "read":
        return await handleReadGlobalMemory();
      case "write":
        return await handleWriteGlobalMemory(content);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  switch (action) {
    case "read":
      return handleReadMemory(toolContext);
    case "write":
      return handleWriteMemory(content, toolContext);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
