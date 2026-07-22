// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Register the Node-side global-context routes with the V8↔Node RPC
 * dispatcher. The `ppal-context` tool runs in V8, which has no filesystem
 * access, so its global-scope read/write round-trips through here to reach
 * ~/.producer-pal/context.md. Imported for side effects from mcp-server.ts so
 * the routes exist before V8 issues its first node_request.
 *
 * Distinct from the Express `GET`/`PUT /global-context` endpoints (used by the
 * webui editor): those serve the browser, these serve the in-Live assistant.
 * Both read/write the same store so all three writers stay consistent.
 */

import { registerNodeRoute } from "../../rpc/node-request-protocol.ts";
import {
  readGlobalContext,
  writeGlobalContext,
} from "./global-context-store.ts";

/** Result shape shared by both routes: the current stored content. */
interface GlobalContextRouteResult {
  content: string;
}

/**
 * Register the `globalContext.read` and `globalContext.write` routes. The
 * underlying registry throws on duplicate registration, so call once.
 */
export function registerGlobalContextNodeRoutes(): void {
  registerNodeRoute("globalContext.read", readRoute);
  registerNodeRoute("globalContext.write", writeRoute);
}

// --- Helpers below main export ---

/**
 * Return the current global context verbatim.
 *
 * @returns The stored content
 */
function readRoute(): GlobalContextRouteResult {
  return { content: readGlobalContext() };
}

/**
 * Overwrite the global context, then echo back what was persisted so the
 * caller's view matches disk exactly.
 *
 * @param args - Route args carrying the new content
 * @returns The stored content after the write
 */
function writeRoute(args: unknown): GlobalContextRouteResult {
  const content = (args as { content?: unknown } | null)?.content;

  if (typeof content !== "string") {
    throw new Error("content must be a string");
  }

  writeGlobalContext(content);

  return { content: readGlobalContext() };
}
