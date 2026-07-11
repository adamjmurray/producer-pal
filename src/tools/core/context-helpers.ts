// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";

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
  // "" is a valid clear; only an omitted content param is rejected so an
  // accidental write can't silently wipe the context.
  if (content == null) {
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

/**
 * Read the machine-global context (~/.producer-pal/context.md). V8 has no
 * filesystem access, so this round-trips to the Node side over the RPC bridge.
 *
 * @returns Memory result with the current global content
 */
export async function handleReadGlobalMemory(): Promise<MemoryResult> {
  return await callNodeMemoryRoute("globalContext.read", {});
}

/**
 * Read one indexed memory entry (~/.producer-pal/memory/&lt;name&gt;.md) by name,
 * over the RPC bridge. Backs the `memory` scope's `read` action.
 *
 * @param name - The memory name/slug to read
 * @returns Memory result with the entry body, or a not-found note
 */
export async function handleReadMemoryEntry(
  name: string,
): Promise<MemoryResult> {
  return await callNodeMemoryRoute("memory.read", { name });
}

/**
 * Create or overwrite an indexed memory entry, then re-derive the index. The
 * Node side owns slug validation and index regeneration. Backs the `memory`
 * scope's `remember` action.
 *
 * @param args - The memory to store
 * @param args.name - Desired memory name (slugified Node-side)
 * @param args.description - One-line recall hook (required)
 * @param args.content - The memory body (the fact)
 * @returns Memory result with the regenerated index
 */
export async function handleRememberMemory(args: {
  name?: string;
  description?: string;
  content?: string;
}): Promise<MemoryResult> {
  if (!args.name) throw new Error("name required for remember action");
  if (!args.content) throw new Error("content required for remember action");

  if (!args.description?.trim()) {
    throw new Error("description required for remember action");
  }

  return await callNodeMemoryRoute("memory.remember", {
    name: args.name,
    description: args.description,
    content: args.content,
  });
}

/**
 * Delete an indexed memory entry (if present), then re-derive the index.
 * Backs the `memory` scope's `forget` action.
 *
 * @param name - The memory name/slug to forget
 * @returns Memory result with the regenerated index
 */
export async function handleForgetMemory(
  name: string | undefined,
): Promise<MemoryResult> {
  if (!name) throw new Error("name required for forget action");

  return await callNodeMemoryRoute("memory.forget", { name });
}

/**
 * List the derived memory index (already injected on connect; this is an
 * explicit refresh). Backs the `memory` scope's `list` action.
 *
 * @returns Memory result with the current index
 */
export async function handleListMemory(): Promise<MemoryResult> {
  return await callNodeMemoryRoute("memory.list", {});
}

/**
 * Overwrite the machine-global context, echoing back what was persisted. Like
 * the project write, "" is a valid clear (matches the webui/REST editor, which
 * lets the user empty the file); only an omitted content param is rejected so
 * an accidental write can't silently wipe it.
 *
 * @param content - Global context content to write ("" clears it)
 * @returns Memory result with the stored content
 */
export async function handleWriteGlobalMemory(
  content: string | undefined,
): Promise<MemoryResult> {
  if (content == null) {
    throw new Error("Content required for write action");
  }

  return await callNodeMemoryRoute("globalContext.write", { content });
}

/**
 * Invoke a Node-side global context/memory route and unwrap the response,
 * throwing on failure so the MCP error path renders a clean message instead of
 * leaking the RPC envelope shape to the LLM. Shared by the pinned-context and
 * indexed-memory routes (both return a `{ content }` payload).
 *
 * @param route - Route name registered on the Node side
 * @param args - Arguments to pass to the route
 * @returns The route's success payload
 */
async function callNodeMemoryRoute(
  route: string,
  args: object,
): Promise<MemoryResult> {
  const response = await requestNode<MemoryResult>(route, args);

  if (!response.success || !response.result) {
    throw new Error(`${route} failed: ${response.error ?? "unknown error"}`);
  }

  return response.result;
}
