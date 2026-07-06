// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Register the Node-side memory routes with the V8↔Node RPC dispatcher. The
 * `ppal-context` tool runs in V8, which has no filesystem, so its global-scope
 * memory ops (read/remember/forget/list) round-trip through here to reach
 * ~/.producer-pal/memory/. Imported for side effects from mcp-server.ts so the
 * routes exist before V8 issues its first node_request.
 *
 * Sibling of global-context-node-routes.ts: that serves the single pinned
 * context.md blob; this serves the multi-entry, index-derived memory
 * collection. Every mutating route echoes back the freshly regenerated index so
 * the assistant always sees the current memory list.
 */

import { registerNodeRoute } from "../../rpc/node-request-protocol.ts";
import { optionalString, requireString } from "../../rpc/route-args.ts";
import {
  forgetMemory,
  readMemoryEntry,
  regenerateIndex,
  rememberMemory,
} from "./global-memory-store.ts";
import { isMemoryType, MEMORY_TYPES } from "./memory.ts";

/** Result shape shared by every memory route: a text payload for the LLM. */
interface MemoryRouteResult {
  content: string;
}

/**
 * Register the `memory.read` / `memory.remember` / `memory.forget` /
 * `memory.list` routes. The underlying registry throws on duplicate
 * registration, so call once.
 */
export function registerGlobalMemoryNodeRoutes(): void {
  registerNodeRoute("memory.read", readRoute);
  registerNodeRoute("memory.remember", rememberRoute);
  registerNodeRoute("memory.forget", forgetRoute);
  registerNodeRoute("memory.list", listRoute);
}

// --- Helpers below main export ---

/**
 * Read one memory's body by name.
 *
 * @param args - Route args carrying the memory name
 * @returns The memory body, or a not-found note
 */
function readRoute(args: unknown): MemoryRouteResult {
  const name = requireString(args, "name");
  const entry = readMemoryEntry(name);

  return { content: entry ? entry.body : `No memory found for "${name}".` };
}

/**
 * Create or overwrite a memory, then echo the regenerated index.
 *
 * @param args - Route args (name, type, description, content=body)
 * @returns Confirmation plus the current index
 */
function rememberRoute(args: unknown): MemoryRouteResult {
  const type = (args as Record<string, unknown> | null)?.type;

  if (!isMemoryType(type)) {
    throw new Error(`type must be one of: ${MEMORY_TYPES.join(", ")}`);
  }

  const entry = rememberMemory({
    name: requireString(args, "name"),
    type,
    description: optionalString(args, "description"),
    body: requireString(args, "content"),
  });

  return { content: `Remembered "${entry.name}".\n\n${currentIndex()}` };
}

/**
 * Delete a memory (if present), then echo the regenerated index.
 *
 * @param args - Route args carrying the memory name
 * @returns Confirmation plus the current index
 */
function forgetRoute(args: unknown): MemoryRouteResult {
  const name = requireString(args, "name");
  const existed = forgetMemory(name);
  const note = existed
    ? `Forgot "${name}".`
    : `No memory to forget for "${name}".`;

  return { content: `${note}\n\n${currentIndex()}` };
}

/**
 * Return the derived index, self-healing it from the files on disk.
 *
 * @returns The current memory index
 */
function listRoute(): MemoryRouteResult {
  return { content: currentIndex() };
}

/**
 * The current index markdown, with a friendly placeholder when empty.
 *
 * @returns The regenerated index, or an empty-collection note
 */
function currentIndex(): string {
  return regenerateIndex() || "(no memories stored)";
}
