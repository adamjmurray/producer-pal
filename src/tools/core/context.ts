// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { refuseContextParamsOutsideAction } from "./helpers/context-action-params.ts";
import {
  handleDeleteMemoryEntries,
  handleReadMemoryEntries,
  handleReadMemoryIndex,
  handleWriteMemoryEntry,
  memoryNames,
  type MemoryNameEntry,
} from "./helpers/memory-entry-operations.ts";
import {
  type ContentResult,
  handleReadGlobalContext,
  handleReadProjectContext,
  handleWriteGlobalContext,
  handleWriteProjectContext,
} from "./helpers/project-context-operations.ts";

interface ContextArgs {
  action?: string;
  content?: string;
  scope?: string;
  name?: string;
  description?: string;
  force?: boolean;
}

/**
 * Context/memory tool for Producer Pal (read/write), across three scopes:
 *  - project (default): this Live Set's context blob, held by the Max device.
 *  - global: the pinned cross-project context blob
 *    (~/.producer-pal/context.md), shared by every project and client.
 *  - memory: the indexed memory collection (~/.producer-pal/memory/) — one
 *    entry per fact, read by name, remembered, forgotten, and listed. A read
 *    or delete takes a comma-separated list of names and answers one entry per
 *    name (unwrapped for one).
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
 * @param args.name - Memory entry name (memory scope); read and delete take a list
 * @param args.description - One-line recall hook (memory write)
 * @param args.force - Replace a project/global document the write keeps none of
 * @param toolContext - The context object
 * @returns Content result, or a memory entry per name named
 */
export async function context(
  args: ContextArgs = {},
  toolContext: Partial<ToolContext> = {},
): Promise<ContentResult | MemoryNameEntry | MemoryNameEntry[]> {
  const { action, content, scope, name, description, force } = args;

  refuseContextParamsOutsideAction({ action, scope: scope ?? "project" }, args);

  if (scope === "memory") {
    switch (action) {
      case "read":
        // Uniform verb, scope-driven target: a name reads that entry, no name
        // reads the whole index (the old dedicated `list` action folded in).
        return await readMemory(name);
      case "write":
        return await handleWriteMemoryEntry({ name, description, content });
      case "delete":
        return await deleteMemory(name);
      default:
        throw new Error(`Unknown action for scope:memory: ${action}`);
    }
  }

  if (scope === "global") {
    switch (action) {
      case "read":
        return await handleReadGlobalContext();
      case "write":
        return await handleWriteGlobalContext(content, force);
      default:
        throw new Error(`Unknown action for scope:global: ${action}`);
    }
  }

  switch (action) {
    case "read":
      return handleReadProjectContext(toolContext);
    case "write":
      return handleWriteProjectContext(content, toolContext, force);
    default:
      throw new Error(`Unknown action for scope:project: ${action}`);
  }
}

// --- Helpers below main exports ---

/**
 * Read memory by name: the names read their entries, none reads the whole
 * index.
 * @param name - The `name` param, possibly a list
 * @returns The entry, the entries, or the index
 */
async function readMemory(
  name: string | undefined,
): Promise<ContentResult | MemoryNameEntry | MemoryNameEntry[]> {
  const names = memoryNames(name);

  return names.length === 0
    ? await handleReadMemoryIndex()
    : await handleReadMemoryEntries(names);
}

/**
 * Delete memory by name.
 * @param name - The `name` param, possibly a list
 * @returns The entry, or one entry per name
 */
async function deleteMemory(
  name: string | undefined,
): Promise<MemoryNameEntry | MemoryNameEntry[]> {
  const names = memoryNames(name);

  if (names.length === 0) {
    throw new Error("name required to delete a memory entry");
  }

  return await handleDeleteMemoryEntries(names);
}
