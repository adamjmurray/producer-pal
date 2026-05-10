// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  type LibraryDeviceKind,
  type LibraryKind,
  type LibraryListTagsResult,
  type LibrarySearchResult,
  type LibrarySort,
  type LibrarySource,
} from "#src/mcp-server/live-library/library-types.ts";

interface LibraryArgs {
  action?: string;
  query?: string;
  tags?: string;
  kind?: string;
  deviceKind?: string;
  source?: string;
  sort?: string;
  limit?: number;
}

type LibraryResult = LibrarySearchResult | LibraryListTagsResult;

/**
 * Search Live's browser library or enumerate available tags.
 *
 * This tool is a thin V8-side shell that dispatches to Node-side routes
 * (library.search / library.listTags) over the V8↔Node RPC channel.
 * Node owns the SQLite access to Live's browser DB.
 *
 * @param args - Tool arguments (action + filters)
 * @returns Search result or tag list, depending on action
 */
export async function library(args: LibraryArgs = {}): Promise<LibraryResult> {
  const action = args.action ?? "search";

  if (action === "listTags") {
    return await callRoute<LibraryListTagsResult>("library.listTags", {
      limit: args.limit,
    });
  }

  if (action !== "search") {
    throw new Error(`Unknown action: ${action}`);
  }

  return await callRoute<LibrarySearchResult>("library.search", {
    query: args.query,
    tags: args.tags,
    kind: args.kind as LibraryKind | undefined,
    deviceKind: args.deviceKind as LibraryDeviceKind | undefined,
    source: args.source as LibrarySource | undefined,
    sort: args.sort as LibrarySort | undefined,
    limit: args.limit,
  });
}

/**
 * Invoke a Node-side route and unwrap the response, throwing on failure
 * so the MCP error path renders a clean message instead of leaking the
 * RPC envelope shape to the LLM.
 *
 * @param route - Route name registered on Node side
 * @param routeArgs - Arguments to pass to the route
 * @returns Route's success payload
 */
async function callRoute<T>(route: string, routeArgs: object): Promise<T> {
  const response = await requestNode<T>(route, routeArgs);

  if (!response.success || !response.result) {
    throw new Error(`${route} failed: ${response.error ?? "unknown error"}`);
  }

  return response.result;
}
