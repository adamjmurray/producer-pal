// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "../connect/connect-append.ts";
import { readGlobalContext } from "./global-context-store.ts";

// Hosts the connect-block injectors for BOTH machine-context blobs: the pinned
// cross-project context.md (withGlobalContext, read from disk here) and the
// per-Live Set device blob (withProjectContext, read from config). They share a
// file because they do the same job — append one labeled context block to a
// ppal-connect response — and because helpers/ is at its 12-item folder cap. V8
// has no filesystem access and its connect() no longer embeds the project blob
// in the result JSON, so both blocks are injected here on the Node side — the
// only path that reaches external MCP clients (Claude Desktop, LM Studio). The
// two scopes stay separately labeled; the layer purpose/ownership teaching lives
// in the (customizable) skills, so these blocks are just a header plus the data.

/**
 * Wrap a callLiveApi so a successful ppal-connect response carries the pinned
 * machine-global user context (~/.producer-pal/context.md) as a distinct,
 * labeled content block.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns A callLiveApi that appends global context to ppal-connect results
 */
export function withGlobalContext(
  inner: CallLiveApiFunction,
): WrappedCallLiveApi {
  return withConnectAppend(inner, globalContextBlock);
}

/**
 * Wrap a callLiveApi so a successful ppal-connect response carries the
 * per-Live Set project context as a distinct, labeled content block — the same
 * shape as the global block. The blob lives in the Max device's config, so the
 * caller supplies a getter rather than a filesystem read.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getProjectContext - Reads the current per-project context blob
 * @returns A callLiveApi that appends project context to ppal-connect results
 */
export function withProjectContext(
  inner: CallLiveApiFunction,
  getProjectContext: () => string,
): WrappedCallLiveApi {
  return withConnectAppend(inner, () =>
    projectContextBlock(getProjectContext()),
  );
}

// --- Helpers below main export ---

/**
 * The global-context block to append, or null when there is no context. Trims
 * here (not in the store) so the raw file stays byte-faithful for the editor's
 * GET/PUT round-trip while the injected block is clean.
 *
 * Exported for the subagent briefing, which composes the same labeled blocks
 * into a worker's system prompt instead of a connect result — the label is what
 * tells the model which layer it is reading, so the two paths must not drift.
 *
 * @returns The labeled global-context text, or null to skip
 */
export function globalContextBlock(): string | null {
  const globalContext = readGlobalContext().trim();

  if (!globalContext) return null;

  return `Global context (all projects):\n\n${globalContext}`;
}

/**
 * The project-context block to append, or null when the blob is empty. Exported
 * alongside {@link globalContextBlock} for the subagent briefing.
 *
 * @param projectContext - The raw per-project context blob
 * @returns The labeled project-context text, or null to skip
 */
export function projectContextBlock(projectContext: string): string | null {
  const trimmed = projectContext.trim();

  if (!trimmed) return null;

  return `Project context (this Live Set):\n\n${trimmed}`;
}
