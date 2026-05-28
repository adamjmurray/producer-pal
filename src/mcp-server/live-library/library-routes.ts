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

import { registerNodeRoute } from "../rpc/node-request-protocol.ts";
import { librarySearch } from "./library-search.ts";
import {
  type LibrarySearchArgs,
  type ListPluginsArgs,
} from "./library-types.ts";
import { type ListCategoriesArgs, listCategories } from "./list-categories.ts";
import { listPlugins } from "./list-plugins.ts";
import { type ListTagsArgs, listTags } from "./list-tags.ts";

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
  registerNodeRoute("library.search", async (args) => {
    return await librarySearch((args as LibrarySearchArgs | null) ?? {});
  });

  registerNodeRoute("library.listTags", async (args) => {
    return await listTags((args as ListTagsArgs | null) ?? {});
  });

  registerNodeRoute("library.listCategories", async (args) => {
    return await listCategories((args as ListCategoriesArgs | null) ?? {});
  });

  registerNodeRoute("library.listPlugins", async (args) => {
    return await listPlugins((args as ListPluginsArgs | null) ?? {});
  });
}
