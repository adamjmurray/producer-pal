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
  return await callGlobalContextRoute("globalContext.read", {});
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

  return await callGlobalContextRoute("globalContext.write", { content });
}

/**
 * Invoke a Node-side global-context route and unwrap the response, throwing on
 * failure so the MCP error path renders a clean message instead of leaking the
 * RPC envelope shape to the LLM.
 *
 * @param route - Route name registered on the Node side
 * @param args - Arguments to pass to the route
 * @returns The route's success payload
 */
async function callGlobalContextRoute(
  route: string,
  args: object,
): Promise<MemoryResult> {
  const response = await requestNode<MemoryResult>(route, args);

  if (!response.success || !response.result) {
    throw new Error(`${route} failed: ${response.error ?? "unknown error"}`);
  }

  return response.result;
}
