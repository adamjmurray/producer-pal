// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  callNodeContentRoute,
  type ContentResult,
} from "./project-context-operations.ts";

/**
 * Read one indexed memory entry (~/.producer-pal/memory/&lt;name&gt;.md) by name,
 * over the RPC bridge. Backs the `memory` scope's `read` action.
 *
 * @param name - The memory name/slug to read
 * @returns Content result with the entry body, or a not-found note
 */
export async function handleReadMemoryEntry(
  name: string,
): Promise<ContentResult> {
  return await callNodeContentRoute("memory.read", { name });
}

/**
 * Create or overwrite an indexed memory entry, then re-derive the index. The
 * Node side owns slug validation and index regeneration. Backs scope:memory
 * `write` (a name'd entry upsert). The wire route is still named
 * `memory.remember` — an internal identifier left for the terminology sweep, so
 * it doesn't reach the AI.
 *
 * @param args - The memory to store
 * @param args.name - Desired memory name (slugified Node-side)
 * @param args.description - One-line recall hook (required)
 * @param args.content - The memory body (the fact)
 * @returns Content result with the regenerated index
 */
export async function handleWriteMemoryEntry(args: {
  name?: string;
  description?: string;
  content?: string;
}): Promise<ContentResult> {
  if (!args.name) {
    throw new Error("name required to write a memory entry");
  }

  if (!args.content) {
    throw new Error("content required to write a memory entry");
  }

  if (!args.description?.trim()) {
    throw new Error("description required to write a memory entry");
  }

  return await callNodeContentRoute("memory.remember", {
    name: args.name,
    description: args.description,
    content: args.content,
  });
}

/**
 * Delete an indexed memory entry (if present), then re-derive the index. Backs
 * scope:memory `delete`. The wire route is still named `memory.forget` — an
 * internal identifier left for the terminology sweep.
 *
 * @param name - The memory name/slug to delete
 * @returns Content result with the regenerated index
 */
export async function handleDeleteMemoryEntry(
  name: string | undefined,
): Promise<ContentResult> {
  if (!name) {
    throw new Error("name required to delete a memory entry");
  }

  return await callNodeContentRoute("memory.forget", { name });
}

/**
 * Read the derived memory index (already injected on connect; this is an
 * explicit refresh). Backs scope:memory `read` with no `name`. The wire route
 * is still named `memory.list` — an internal identifier left for the
 * terminology sweep.
 *
 * @returns Content result with the current index
 */
export async function handleReadMemoryIndex(): Promise<ContentResult> {
  return await callNodeContentRoute("memory.list", {});
}
