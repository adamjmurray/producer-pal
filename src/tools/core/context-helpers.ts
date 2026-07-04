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
 * over the RPC bridge.
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
 * Node side owns slug validation and index regeneration.
 *
 * @param args - The memory to store
 * @param args.name - Desired memory name (slugified Node-side)
 * @param args.type - Memory bucket (user | feedback | goal | reference)
 * @param args.description - One-line recall hook (optional)
 * @param args.content - The memory body (the fact)
 * @returns Memory result with the regenerated index
 */
export async function handleRememberMemory(args: {
  name?: string;
  type?: string;
  description?: string;
  content?: string;
}): Promise<MemoryResult> {
  if (!args.name) throw new Error("name required for remember action");
  if (!args.type) throw new Error("type required for remember action");
  if (!args.content) throw new Error("content required for remember action");

  return await callNodeMemoryRoute("memory.remember", {
    name: args.name,
    type: args.type,
    description: args.description ?? "",
    content: args.content,
  });
}

/**
 * Delete an indexed memory entry (if present), then re-derive the index.
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
 * explicit refresh).
 *
 * @returns Memory result with the current index
 */
export async function handleListMemory(): Promise<MemoryResult> {
  return await callNodeMemoryRoute("memory.list", {});
}

/**
 * Overwrite the machine-global context, echoing back what was persisted. Like
 * the project write, an empty/missing content is rejected so an accidental
 * write can't silently wipe the file.
 *
 * @param content - Global context content to write
 * @returns Memory result with the stored content
 */
export async function handleWriteGlobalMemory(
  content: string | undefined,
): Promise<MemoryResult> {
  if (!content) {
    throw new Error("Content required for write action");
  }

  return await callNodeMemoryRoute("globalContext.write", { content });
}

/**
 * Read one custom skill's instruction body by name (global scope:skills), over
 * the RPC bridge.
 *
 * @param name - The skill name/slug to read
 * @returns Memory result with the skill body, or a not-found note
 */
export async function handleReadSkill(name: string): Promise<MemoryResult> {
  return await callNodeMemoryRoute("skills.read", { name });
}

/**
 * Create or overwrite a custom skill, then re-derive the index. The Node side
 * owns slug validation, the enabled flag, and index regeneration. Authoring is
 * user-driven, so this runs only when the user asks the assistant to save a
 * skill.
 *
 * @param args - The skill to store
 * @param args.name - Desired skill name (slugified Node-side)
 * @param args.description - One-line "load me when…" hook (optional)
 * @param args.content - The instruction body
 * @returns Memory result with the regenerated index
 */
export async function handleRememberSkill(args: {
  name?: string;
  description?: string;
  content?: string;
}): Promise<MemoryResult> {
  if (!args.name) throw new Error("name required for remember action");
  if (!args.content) throw new Error("content required for remember action");

  return await callNodeMemoryRoute("skills.remember", {
    name: args.name,
    description: args.description ?? "",
    content: args.content,
  });
}

/**
 * Delete a custom skill (if present), then re-derive the index.
 *
 * @param name - The skill name/slug to delete
 * @returns Memory result with the regenerated index
 */
export async function handleForgetSkill(
  name: string | undefined,
): Promise<MemoryResult> {
  if (!name) throw new Error("name required for forget action");

  return await callNodeMemoryRoute("skills.forget", { name });
}

/**
 * List the derived custom-skills index (already injected on connect; this is an
 * explicit refresh).
 *
 * @returns Memory result with the current index
 */
export async function handleListSkills(): Promise<MemoryResult> {
  return await callNodeMemoryRoute("skills.list", {});
}

/**
 * Invoke a Node-side global context/memory/skills route and unwrap the response,
 * throwing on failure so the MCP error path renders a clean message instead of
 * leaking the RPC envelope shape to the LLM. Shared by the pinned-context,
 * indexed-memory, and custom-skills routes (all return a `{ content }` payload).
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
