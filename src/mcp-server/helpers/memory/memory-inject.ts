// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "../connect/connect-append.ts";
import { listMemoryEntries, renderMemoryIndex } from "./memory-store.ts";

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
 * Skipped entirely in small-model mode: `ppal-context`'s small-model surface
 * drops scope=memory (remember/forget/list/read-by-name), so an injected index
 * pointing at those actions would be a dead end.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getSmallModelMode - Reads the current small-model-mode setting
 * @returns A callLiveApi that appends the memory index to ppal-connect results
 */
export function withMemory(
  inner: CallLiveApiFunction,
  getSmallModelMode: () => boolean,
): WrappedCallLiveApi {
  return withConnectAppend(inner, () => memoryBlock(getSmallModelMode()));
}

// --- Helpers below main export ---

/**
 * The memory index block to append, or null when there are no memories or
 * small-model mode is active. Only the index (flat `name — description` hooks)
 * is injected; bodies load on demand.
 *
 * @param smallModelMode - Whether small-model mode is active
 * @returns The memory index text, or null to skip
 */
function memoryBlock(smallModelMode: boolean): string | null {
  if (smallModelMode) return null;

  const entries = listMemoryEntries();

  if (entries.length === 0) return null;

  return (
    'Memory index — load a body with ppal-context (action:"read", ' +
    'scope:"memory", name:"<name>"):\n\n' +
    renderMemoryIndex(entries)
  );
}
