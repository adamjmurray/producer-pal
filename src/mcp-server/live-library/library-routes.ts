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
import { setRunningLiveMajor } from "./live-db-path.ts";
import { ensureSqliteAvailable } from "./live-db.ts";
import { findDuplicates } from "./query/find-duplicates.ts";
import { findSimilar } from "./query/find-similar.ts";
import { librarySearch } from "./query/library-search.ts";

/**
 * Register all library routes. Idempotency is the caller's responsibility;
 * the underlying registry throws on duplicate registration.
 *
 * Each route opens and closes its own DB handle, including inside a
 * `searches` fan-out that runs up to 20 searches in one MCP request. Measured
 * rather than assumed, on a 47MB Live-files DB: reopening per query costs
 * ~3.5ms across a 20-query batch (~20% of the DB time — mostly the page
 * cache being thrown away, not the open itself, which is 0.02ms under
 * `immutable=1`). Locating the DB and reading staleness add ~0.09ms per
 * query between them.
 *
 * Not worth a shared handle. Node sees each search as its own node_request
 * with no MCP-request correlation, so a per-request scope needs either an
 * explicit begin/end from V8 (two more round trips, which is most of the
 * 3.5ms back) or a time-based handle cache (a stale snapshot window, since
 * an `immutable=1` handle never sees Live's later writes). Either buys
 * 0.17ms per query on a path already paying a V8↔Node round trip for it.
 */
export function registerLibraryRoutes(): void {
  registerNodeRoute(
    "library.search",
    libraryRoute((args) =>
      librarySearch((args as LibrarySearchArgs | null) ?? {}),
    ),
  );

  registerNodeRoute(
    "library.listTags",
    libraryRoute((args) => listTags((args as ListTagsArgs | null) ?? {})),
  );

  registerNodeRoute(
    "library.listCategories",
    libraryRoute((args) =>
      listCategories((args as ListCategoriesArgs | null) ?? {}),
    ),
  );

  registerNodeRoute(
    "library.listPlugins",
    libraryRoute((args) => listPlugins((args as ListPluginsArgs | null) ?? {})),
  );

  registerNodeRoute(
    "library.findSimilar",
    libraryRoute((args) => findSimilar((args as FindSimilarArgs | null) ?? {})),
  );

  registerNodeRoute(
    "library.findDuplicates",
    libraryRoute((args) =>
      findDuplicates((args as FindDuplicatesArgs | null) ?? {}),
    ),
  );
}

/**
 * Wrap a library route handler with the two things every library route needs
 * before its own DB code runs.
 *
 * It records which Live major is running, from the `liveVersion` V8 sends with
 * every route call, so DB selection prefers that install's databases over a
 * newer install's stale ones (see live-db-path.ts).
 *
 * Then it confirms the runtime provides `node:sqlite`, throwing
 * `SqliteUnavailableError`. That surfaces an unsupported runtime (a Max older
 * than the one bundled with Live 12.4) as a hard tool error the chat UI flags
 * and the LLM sees — distinct from the soft `dbAvailable: false` degrade the
 * handlers return for a missing DB or schema drift.
 *
 * @param handler - The underlying route handler
 * @returns A handler that records the Live major and runs the availability guard
 */
function libraryRoute(handler: NodeRouteHandler): NodeRouteHandler {
  return async (args) => {
    setRunningLiveMajor(liveMajorFromArgs(args));

    await ensureSqliteAvailable();

    return handler(args);
  };
}

/**
 * Read the running Live major out of a route's `liveVersion` arg. The arg comes
 * straight from V8 unvalidated, so anything unparseable means "unknown". A
 * number is accepted too: V8 coerces a bare "12.4" unless the sender forces a
 * string.
 *
 * @param args - Raw route args
 * @returns The major version (12 for "12.4"), or null when absent or unparseable
 */
function liveMajorFromArgs(args: unknown): number | null {
  const liveVersion = (args as { liveVersion?: unknown } | null)?.liveVersion;
  const major =
    typeof liveVersion === "string" || typeof liveVersion === "number"
      ? Number.parseInt(String(liveVersion), 10)
      : Number.NaN;

  return Number.isNaN(major) ? null : major;
}
