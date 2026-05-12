// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  type LibraryDeviceKind,
  type LibraryItem,
  type LibraryKind,
  type LibraryListTagsResult,
  type LibrarySearchResult,
  type LibrarySort,
  type LibrarySource,
} from "#src/mcp-server/live-library/library-types.ts";
import { readSamples } from "#src/tools/workflow/read-samples.ts";

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

/** Default item cap (mirrors the DB-side default) */
const DEFAULT_LIMIT = 50;

/**
 * Search Live's browser library or enumerate available tags.
 *
 * The search action runs two sources in parallel:
 *  - Folder scan (V8): the user-configured sampleFolder, when set
 *    AND filters don't require DB-only data (tags, non-audio kind, deviceKind).
 *  - DB query (Node): library.search route via requestNode RPC.
 * Results are merged and de-duplicated by absolute path. The folder
 * scan wins ties because the folder is explicitly user-configured.
 *
 * @param args - Tool arguments (action + filters)
 * @param toolContext - Per-request context carrying sampleFolder
 * @returns Search result or tag list, depending on action
 */
export async function library(
  args: LibraryArgs = {},
  toolContext: Partial<ToolContext> = {},
): Promise<LibraryResult> {
  const action = args.action ?? "search";

  if (action === "listTags") {
    return await callRoute<LibraryListTagsResult>("library.listTags", {
      limit: args.limit,
    });
  }

  if (action !== "search") {
    throw new Error(`Unknown action: ${action}`);
  }

  return await runSearch(args, toolContext);
}

/**
 * Run a structured search against the configured folder + Live's DB,
 * merging results.
 *
 * @param args - Tool arguments
 * @param ctx - Per-request context
 * @returns Merged LibrarySearchResult
 */
async function runSearch(
  args: LibraryArgs,
  ctx: Partial<ToolContext>,
): Promise<LibrarySearchResult> {
  const folderItems = scanFolderItems(args, ctx);
  // source=folder bypasses the DB entirely; the response omits dbAvailable
  // to signal "did not consult the DB" instead of lying with `true`.
  const dbResult =
    args.source === "folder"
      ? null
      : await callRoute<LibrarySearchResult>("library.search", {
          query: args.query,
          tags: args.tags,
          kind: args.kind as LibraryKind | undefined,
          deviceKind: args.deviceKind as LibraryDeviceKind | undefined,
          source: args.source as LibrarySource | undefined,
          sort: args.sort as LibrarySort | undefined,
          limit: args.limit,
        });

  const folderPaths = new Set(folderItems.map((i) => i.path));
  const dbItems = (dbResult?.items ?? []).filter(
    (i) => !folderPaths.has(i.path),
  );
  const merged = sortItems([...folderItems, ...dbItems], args.sort);
  const limit = clampLimit(args.limit);
  const items = merged.slice(0, limit);

  if (dbResult == null) {
    return { items };
  }

  return { dbAvailable: dbResult.dbAvailable, items };
}

/**
 * Scan the configured sample folder when filters allow it and
 * convert results to LibraryItem shape.
 *
 * @param args - Tool arguments
 * @param ctx - Per-request context
 * @returns Folder-sourced library items, or empty if scan is skipped
 */
function scanFolderItems(
  args: LibraryArgs,
  ctx: Partial<ToolContext>,
): LibraryItem[] {
  const sampleFolder = ctx.sampleFolder;

  if (!sampleFolder) {
    return [];
  }

  // The folder scan can only satisfy: name substring + (implicit) audio kind.
  // Any DB-only filter means the user is not asking for folder content.
  if (args.source && args.source !== "folder") {
    return [];
  }

  if (args.tags) {
    return [];
  }

  if (args.kind && args.kind !== "audio") {
    return [];
  }

  if (args.deviceKind) {
    return [];
  }

  const result = readSamples({ search: args.query }, ctx);

  return result.samples.map((rel) => ({
    name: leafName(rel),
    path: `${result.sampleFolder}${rel}`,
    kind: "audio",
    tags: [],
    useCount: 0,
    source: "folder",
  }));
}

/**
 * Get the leaf filename from a slash-delimited relative path.
 *
 * @param rel - Relative path like "drums/kick.wav"
 * @returns Final segment ("kick.wav")
 */
function leafName(rel: string): string {
  const idx = rel.lastIndexOf("/");

  return idx === -1 ? rel : rel.slice(idx + 1);
}

/**
 * Sort merged items per the requested sort enum.
 *
 * @param items - Combined list of folder + DB items (folder first)
 * @param sort - Sort enum (defaults to use_count)
 * @returns Sorted copy of items
 */
function sortItems(
  items: LibraryItem[],
  sort: string | undefined,
): LibraryItem[] {
  if (sort === "name") {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }

  if (sort === "mod_date") {
    // LibraryItem has no mod_date field; trust the DB's pre-sorted order
    // and append folder items at the end (no mod_date metadata for them).
    const folder = items.filter((i) => i.source === "folder");
    const db = items.filter((i) => i.source !== "folder");

    return [...db, ...folder];
  }

  // use_count (default): folder items have useCount=0 → naturally at end.
  return [...items].sort(
    (a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name),
  );
}

/**
 * Clamp a requested limit to a safe positive integer.
 *
 * @param requested - User-supplied limit
 * @returns Limit between 1 and 1000
 */
function clampLimit(requested: number | undefined): number {
  if (requested == null || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(requested), 1_000);
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
