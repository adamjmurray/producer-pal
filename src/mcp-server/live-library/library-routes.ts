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
import { type LibrarySearchArgs } from "./library-types.ts";
import { type ListTagsArgs, listTags } from "./list-tags.ts";
import { type SampleSearchArgs, searchSamples } from "./search-samples.ts";

/**
 * Register all library routes. Idempotency is the caller's responsibility;
 * the underlying registry throws on duplicate registration.
 */
export function registerLibraryRoutes(): void {
  registerNodeRoute("library.searchSamples", async (args) => {
    return await searchSamples((args as SampleSearchArgs | null) ?? {});
  });

  registerNodeRoute("library.search", async (args) => {
    return await librarySearch((args as LibrarySearchArgs | null) ?? {});
  });

  registerNodeRoute("library.listTags", async (args) => {
    return await listTags((args as ListTagsArgs | null) ?? {});
  });
}
