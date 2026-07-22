// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type MemoryResult,
  handleDeleteMemoryEntry,
  handleReadGlobalMemory,
  handleReadMemory,
  handleReadMemoryEntry,
  handleReadMemoryIndex,
  handleWriteGlobalMemory,
  handleWriteMemory,
  handleWriteMemoryEntry,
} from "./context-helpers.ts";

interface ContextArgs {
  action?: string;
  content?: string;
  scope?: string;
  name?: string;
  description?: string;
}

/**
 * Context/memory tool for Producer Pal (read/write), across three scopes:
 *  - project (default): this Live Set's context blob, held by the Max device.
 *  - global: the pinned cross-project context blob
 *    (~/.producer-pal/context.md), shared by every project and client.
 *  - memory: the indexed memory collection (~/.producer-pal/memory/) — one
 *    entry per fact, read by name, remembered, forgotten, and listed.
 * V8 has no filesystem, so global and memory scopes round-trip to the Node
 * side over the RPC bridge.
 *
 * Sample search lives in `ppal-library` now (which surfaces both Live's
 * browser DB and the user-configured sampleFolder).
 *
 * @param args - The parameters
 * @param args.action - Action to perform (read, write, delete)
 * @param args.content - Content to write (blob document, or memory entry body)
 * @param args.scope - Which context to target (project | global | memory; default project)
 * @param args.name - Memory entry name (read/write/delete, memory scope)
 * @param args.description - One-line recall hook (memory write)
 * @param toolContext - The context object
 * @returns Memory result
 */
export async function context(
  { action, content, scope, name, description }: ContextArgs = {},
  toolContext: Partial<ToolContext> = {},
): Promise<MemoryResult> {
  if (scope === "memory") {
    switch (action) {
      case "read":
        // Uniform verb, scope-driven target: a name reads that entry, no name
        // reads the whole index (the old dedicated `list` action folded in).
        return name
          ? await handleReadMemoryEntry(name)
          : await handleReadMemoryIndex();
      case "write":
        return await handleWriteMemoryEntry({ name, description, content });
      case "delete":
        return await handleDeleteMemoryEntry(name);
      default:
        throw new Error(`Unknown action for scope:memory: ${action}`);
    }
  }

  if (scope === "global") {
    switch (action) {
      case "read":
        return await handleReadGlobalMemory();
      case "write":
        return await handleWriteGlobalMemory(content);
      default:
        throw new Error(`Unknown action for scope:global: ${action}`);
    }
  }

  switch (action) {
    case "read":
      return handleReadMemory(toolContext);
    case "write":
      return handleWriteMemory(content, toolContext);
    default:
      throw new Error(`Unknown action for scope:project: ${action}`);
  }
}
