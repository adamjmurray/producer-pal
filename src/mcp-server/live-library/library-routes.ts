// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Register Node-side library routes with the V8↔Node RPC dispatcher.
 *
 * Imported for side effects from mcp-server.ts so routes are available
 * by the time V8 issues its first node_request.
 */

import {
  type NodeRouteHandler,
  registerNodeRoute,
} from "../rpc/node-request-protocol.ts";
import {
  type FindDuplicatesArgs,
  type FindSimilarArgs,
  type LibrarySearchArgs,
  type ListPluginsArgs,
} from "./library-types.ts";
import { type ListCategoriesArgs, listCategories } from "./list-categories.ts";
import { listPlugins } from "./list-plugins.ts";
import { type ListTagsArgs, listTags } from "./list-tags.ts";
import { ensureSqliteAvailable } from "./live-db.ts";
import { findDuplicates } from "./query/find-duplicates.ts";
import { findSimilar } from "./query/find-similar.ts";
import { librarySearch } from "./query/library-search.ts";

/**
 * Register all library routes. Idempotency is the caller's responsibility;
 * the underlying registry throws on duplicate registration.
 *
 * TODO: each route currently opens and closes its own DB handle. Cheap
 * with `immutable=1` (no locking) but redundant. If a single MCP request
 * ever composes multiple routes (e.g. search + listTags), pull the open
 * up into a per-request scope.
 */
export function registerLibraryRoutes(): void {
  registerNodeRoute(
    "library.search",
    guardSqlite((args) =>
      librarySearch((args as LibrarySearchArgs | null) ?? {}),
    ),
  );

  registerNodeRoute(
    "library.listTags",
    guardSqlite((args) => listTags((args as ListTagsArgs | null) ?? {})),
  );

  registerNodeRoute(
    "library.listCategories",
    guardSqlite((args) =>
      listCategories((args as ListCategoriesArgs | null) ?? {}),
    ),
  );

  registerNodeRoute(
    "library.listPlugins",
    guardSqlite((args) => listPlugins((args as ListPluginsArgs | null) ?? {})),
  );

  registerNodeRoute(
    "library.findSimilar",
    guardSqlite((args) => findSimilar((args as FindSimilarArgs | null) ?? {})),
  );

  registerNodeRoute(
    "library.findDuplicates",
    guardSqlite((args) =>
      findDuplicates((args as FindDuplicatesArgs | null) ?? {}),
    ),
  );
}

/**
 * Wrap a library route handler so every invocation first confirms the runtime
 * provides `node:sqlite`, throwing `SqliteUnavailableError` before the
 * handler's own DB code runs. That surfaces an unsupported runtime (a Max older
 * than the one bundled with Live 12.4) as a hard tool error the chat UI flags
 * and the LLM sees — distinct from the soft `dbAvailable: false` degrade the
 * handlers return for a missing DB or schema drift.
 *
 * @param handler - The underlying route handler
 * @returns A handler that runs the availability guard first
 */
function guardSqlite(handler: NodeRouteHandler): NodeRouteHandler {
  return async (args) => {
    await ensureSqliteAvailable();

    return handler(args);
  };
}
