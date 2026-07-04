// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "../connect-append.ts";
import { listMemoryEntries, type MemoryEntry } from "./global-memory-store.ts";
import { isEagerMemoryType } from "./memory.ts";

/**
 * Wrap a callLiveApi so a successful ppal-connect response carries the user's
 * indexed memory (~/.producer-pal/memory/) as a distinct content block. Eager
 * memories (`user`/`feedback`) are injected as full bodies; lazy memories
 * (`project`/`reference`) contribute only an index hook the assistant can load
 * on demand via `ppal-context read`. V8 has no filesystem, so this is assembled
 * Node-side — the only path reaching external MCP clients (Claude Desktop, LM
 * Studio), which have no recall harness of their own.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns A callLiveApi that appends the memory block to ppal-connect results
 */
export function withMemory(inner: CallLiveApiFunction): WrappedCallLiveApi {
  return withConnectAppend(inner, memoryBlock);
}

// --- Helpers below main export ---

/**
 * The memory block to append, or null when there are no memories. Eager bodies
 * are always injected; lazy entries appear as loadable index hooks.
 *
 * @returns The labeled memory text, or null to skip
 */
function memoryBlock(): string | null {
  const entries = listMemoryEntries();

  if (entries.length === 0) return null;

  const eager = entries.filter((entry) => isEagerMemoryType(entry.type));
  const lazy = entries.filter((entry) => !isEagerMemoryType(entry.type));
  const sections = [
    "Producer Pal user memory — persistent facts about this user, " +
      "remembered across sessions and projects (distinct from this Live Set's " +
      "per-project context).",
  ];

  if (eager.length > 0) {
    sections.push(
      `Always in context:\n\n${eager.map(eagerBlock).join("\n\n")}`,
    );
  }

  if (lazy.length > 0) {
    sections.push(
      'Available on demand — call ppal-context (action:"read", ' +
        'scope:"global", name:"<name>") to load one:\n' +
        lazy.map(lazyLine).join("\n"),
    );
  }

  return sections.join("\n\n");
}

/**
 * Render an eager memory as a titled body block.
 *
 * @param entry - The memory entry
 * @returns The `### name` heading followed by the body
 */
function eagerBlock(entry: MemoryEntry): string {
  return `### ${entry.name}\n${entry.body}`;
}

/**
 * Render a lazy memory as a one-line index hook.
 *
 * @param entry - The memory entry
 * @returns A `- \`name\` — description` line (description omitted when blank)
 */
function lazyLine(entry: MemoryEntry): string {
  return entry.description
    ? `- \`${entry.name}\` — ${entry.description}`
    : `- \`${entry.name}\``;
}
