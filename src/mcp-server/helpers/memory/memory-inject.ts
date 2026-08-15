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

/** The tool the index tells the model to load a memory body with. */
const CONTEXT_TOOL = "ppal-context";

/** What the memory index injection depends on. */
export interface MemoryInjectConfig {
  smallModelMode: boolean;
  /**
   * The tools this caller can call — the global whitelist, or one request's
   * narrowed set. Omitted ⇒ no gating.
   */
  tools?: readonly string[];
}

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
 * Skipped when nothing can load a body from it: in small-model mode, because
 * `ppal-context`'s small-model surface drops scope=memory; and when the caller's
 * toolset has no `ppal-context` at all (Context unchecked in the chat UI's Tools
 * tab). Either way an injected index would point at an action the model cannot
 * take. The briefing route omits it for a worker for the same reason.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getConfig - Reads the current small-model-mode setting and toolset
 * @returns A callLiveApi that appends the memory index to ppal-connect results
 */
export function withMemory(
  inner: CallLiveApiFunction,
  getConfig: () => MemoryInjectConfig,
): WrappedCallLiveApi {
  return withConnectAppend(inner, () => memoryBlock(getConfig()));
}

// --- Helpers below main export ---

/**
 * The memory index block to append, or null when there are no memories or
 * nothing could load a body from the index. Only the index (flat
 * `name — description` hooks) is injected; bodies load on demand.
 *
 * @param config - The current small-model-mode setting and toolset
 * @param config.smallModelMode - Whether small-model mode is active
 * @param config.tools - The caller's tools (omit for no gating)
 * @returns The memory index text, or null to skip
 */
function memoryBlock({
  smallModelMode,
  tools,
}: MemoryInjectConfig): string | null {
  if (smallModelMode) return null;

  if (tools != null && !tools.includes(CONTEXT_TOOL)) return null;

  const entries = listMemoryEntries();

  if (entries.length === 0) return null;

  return (
    'Memory index — load a body with ppal-context (action:"read", ' +
    'scope:"memory", name:"<name>"):\n\n' +
    renderMemoryIndex(entries)
  );
}
