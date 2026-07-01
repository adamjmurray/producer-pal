// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CallLiveApiFunction } from "../create-mcp-server.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect-append.ts";
import { readGlobalContext } from "./global-context-store.ts";

/**
 * Wrap a callLiveApi so a successful ppal-connect response carries the
 * machine-global user context (~/.producer-pal/context.md) as a distinct,
 * clearly-labeled content block. V8 has no filesystem access, so this is
 * injected here on the Node side — the only path that reaches external MCP
 * clients (Claude Desktop, LM Studio), which see context solely through the
 * connect result. The V8 connect body still carries the device's per-project
 * context (memoryContent); the two scopes stay separately labeled.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns A callLiveApi that appends global context to ppal-connect results
 */
export function withGlobalContext(
  inner: CallLiveApiFunction,
): WrappedCallLiveApi {
  return withConnectAppend(inner, globalContextBlock);
}

// --- Helpers below main export ---

/**
 * The global-context block to append, or null when there is no context. Trims
 * here (not in the store) so the raw file stays byte-faithful for the editor's
 * GET/PUT round-trip while the injected block is clean.
 *
 * @returns The labeled global-context text, or null to skip
 */
function globalContextBlock(): string | null {
  const globalContext = readGlobalContext().trim();

  if (!globalContext) return null;

  return (
    "Global context — persistent user preferences and facts that apply " +
    "across ALL projects (distinct from this Live Set's per-project " +
    `context):\n\n${globalContext}`
  );
}
