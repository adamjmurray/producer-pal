// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";

export interface ContentResult {
  content: string;
}

/**
 * Handle read action for the project context blob.
 * @param context - The context object
 * @returns Content result with the project context
 */
export function handleReadProjectContext(
  context: Partial<ToolContext> = {},
): ContentResult {
  return { content: context.projectContext?.content ?? "" };
}

/**
 * Handle write action for the project context blob.
 * @param content - Project context content to write
 * @param context - The context object
 * @returns Content result with the updated project context
 */
export function handleWriteProjectContext(
  content: string | undefined,
  context: Partial<ToolContext> = {},
): ContentResult {
  // "" is a valid clear; only an omitted content param is rejected so an
  // accidental write can't silently wipe the context.
  if (content == null) {
    throw new Error("Content required for write action");
  }

  const projectContext = context.projectContext;

  if (projectContext) {
    projectContext.content = content;
  }

  // Send update to Max patch via outlet
  outlet(0, "update_project_context", content);

  return { content };
}

/**
 * Read the machine-global context (~/.producer-pal/context.md). V8 has no
 * filesystem access, so this round-trips to the Node side over the RPC bridge.
 *
 * @returns Content result with the current global context
 */
export async function handleReadGlobalContext(): Promise<ContentResult> {
  return await callNodeContentRoute("globalContext.read", {});
}

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
  if (!args.name) throw new Error("name required to write a memory entry");
  if (!args.content)
    throw new Error("content required to write a memory entry");

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
  if (!name) throw new Error("name required to delete a memory entry");

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

/**
 * Overwrite the machine-global context, echoing back what was persisted. Like
 * the project write, "" is a valid clear (matches the webui/REST editor, which
 * lets the user empty the file); only an omitted content param is rejected so
 * an accidental write can't silently wipe it.
 *
 * @param content - Global context content to write ("" clears it)
 * @returns Content result with the stored content
 */
export async function handleWriteGlobalContext(
  content: string | undefined,
): Promise<ContentResult> {
  if (content == null) {
    throw new Error("Content required for write action");
  }

  return await callNodeContentRoute("globalContext.write", { content });
}

/**
 * Invoke a Node-side global-context/memory route and unwrap the response,
 * throwing on failure so the MCP error path renders a clean message instead of
 * leaking the RPC envelope shape to the LLM. Shared by the pinned-context and
 * indexed-memory routes (both return a `{ content }` payload).
 *
 * @param route - Route name registered on the Node side
 * @param args - Arguments to pass to the route
 * @returns The route's success payload
 */
async function callNodeContentRoute(
  route: string,
  args: object,
): Promise<ContentResult> {
  const response = await requestNode<ContentResult>(route, args);

  if (!response.success || !response.result) {
    throw new Error(`${route} failed: ${response.error ?? "unknown error"}`);
  }

  return response.result;
}
