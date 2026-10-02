// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The Node-side memory routes: the shared collection quartet
 * (rpc/collection-node-routes.ts) bound to the memory store, reaching
 * ~/.producer-pal/memory/. Imported for side effects from mcp-server.ts so the
 * routes exist before V8 issues its first node_request.
 *
 * Sibling of global-context-node-routes.ts: that serves the single pinned
 * context.md blob; this serves the multi-entry, index-derived memory collection.
 */

import { makeCollectionNodeRoutes } from "../../rpc/collection-node-routes.ts";
import {
  forgetMemory,
  readMemoryEntry,
  regenerateIndex,
  rememberMemory,
} from "./memory-store.ts";

/**
 * Register the `memory.read` / `memory.remember` / `memory.forget` /
 * `memory.list` routes. The underlying registry throws on duplicate
 * registration, so call once.
 */
export const registerMemoryNodeRoutes = makeCollectionNodeRoutes({
  namespace: "memory",
  noun: "memory",
  emptyIndex: "(no memories stored)",
  missingDeleteNote: (name) => `No memory named "${name}" to delete.`,
  read: readMemoryEntry,
  remember: rememberMemory,
  forget: forgetMemory,
  regenerateIndex,
});
