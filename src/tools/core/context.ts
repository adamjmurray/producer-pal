// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type MemoryResult,
  handleForgetMemory,
  handleListMemory,
  handleReadGlobalMemory,
  handleReadMemory,
  handleReadMemoryEntry,
  handleRememberMemory,
  handleWriteGlobalMemory,
  handleWriteMemory,
} from "./context-helpers.ts";

interface ContextArgs {
  action?: string;
  content?: string;
  scope?: string;
  name?: string;
  type?: string;
  description?: string;
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
 * @param args.action - Action to perform (read, write, remember, forget, list)
 * @param args.content - Memory content (write = context.md; remember = body)
 * @param args.scope - Which context to target (project | global; default project)
 * @param args.name - Memory entry name (read/remember/forget, global scope)
 * @param args.type - Memory type (remember): user | feedback | project | reference
 * @param args.description - One-line recall hook (remember)
 * @param toolContext - The context object
 * @returns Memory result
 */
export async function context(
  { action, content, scope, name, type, description }: ContextArgs = {},
  toolContext: Partial<ToolContext> = {},
): Promise<MemoryResult> {
  if (scope === "global") {
    switch (action) {
      case "read":
        return name
          ? await handleReadMemoryEntry(name)
          : await handleReadGlobalMemory();
      case "write":
        return await handleWriteGlobalMemory(content);
      case "remember":
        return await handleRememberMemory({ name, type, description, content });
      case "forget":
        return await handleForgetMemory(name);
      case "list":
        return await handleListMemory();
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
