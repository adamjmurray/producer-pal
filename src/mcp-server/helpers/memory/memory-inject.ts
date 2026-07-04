// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "../connect-append.ts";
import {
  listMemoryEntries,
  renderMemoryIndexSections,
} from "./global-memory-store.ts";

/**
 * Wrap a callLiveApi so a successful ppal-connect response carries the user's
 * memory INDEX (~/.producer-pal/memory/) as a distinct content block. Injection
 * is index-only: every entry contributes just its `name — description` recall
 * hook, never its body. The body loads on demand via `ppal-context read`. The
 * always-present index is the whole recall harness — without it the assistant
 * would never know what has been remembered. V8 has no filesystem, so this is
 * assembled Node-side, the only path reaching external MCP clients (Claude
 * Desktop, LM Studio), which have no recall harness of their own.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns A callLiveApi that appends the memory index to ppal-connect results
 */
export function withMemory(inner: CallLiveApiFunction): WrappedCallLiveApi {
  return withConnectAppend(inner, memoryBlock);
}

// --- Helpers below main export ---

/**
 * The memory index block to append, or null when there are no memories. Only
 * the index (grouped `name — description` hooks) is injected; bodies load on
 * demand.
 *
 * @returns The labeled memory index text, or null to skip
 */
function memoryBlock(): string | null {
  const entries = listMemoryEntries();

  if (entries.length === 0) return null;

  return (
    "Producer Pal user memory — persistent facts about this user, remembered " +
    "across sessions and projects (distinct from this Live Set's per-project " +
    "context). This is the index; to load a memory's full body call " +
    'ppal-context (action:"read", scope:"global", name:"<name>").\n\n' +
    renderMemoryIndexSections(entries)
  );
}
