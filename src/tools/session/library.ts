// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  clampLibraryLimit,
  DEFAULT_LIBRARY_LIMIT,
  type LibraryBatchQuery,
  type LibraryBatchResult,
  type LibraryDeviceKind,
  type LibraryItem,
  type LibraryItemType,
  type LibraryKind,
  type LibraryListCategoriesResult,
  type LibraryListTagsResult,
  type LibrarySearchResult,
  type LibrarySort,
  type LibrarySource,
  type ListPluginsResult,
  type PluginCategory,
  type PluginFormat,
} from "#src/mcp-server/live-library/library-types.ts";
import { runSearchBatch } from "./library-search-batch-helpers.ts";
import { readSamples } from "./read-samples.ts";

// deviceKind doubles as the plugin category filter for listPlugins. Only the
// values plugins can actually be (instrument/audiofx) map through; midifx has
// no plugin-category equivalent and is dropped.
const PLUGIN_CATEGORIES = new Set<LibraryDeviceKind>(["instrument", "audiofx"]);

interface LibraryArgs {
  // Typed as plain string (not the enum) so the runtime "Unknown action"
  // guard below — defense against the V8 adapter forwarding unvalidated
  // input — remains reachable.
  action?: string;
  query?: string;
  tags?: string;
  kind?: LibraryKind;
  type?: LibraryItemType;
  deviceKind?: LibraryDeviceKind;
  source?: LibrarySource;
  inFolder?: string;
  sort?: LibrarySort;
  limit?: number;
  verifyPaths?: boolean;
  /** listCategories only: top-level category to drill into. */
  category?: string;
  /** searchBatch only: per-query filter sets (see runSearchBatch). */
  queries?: LibraryBatchQuery[];
  /** listPlugins only: vendor/manufacturer substring filter. */
  vendor?: string;
  /** listPlugins only: restrict to a single plugin format. */
  format?: PluginFormat;
  /** listPlugins only: subcategory substring filter (case-insensitive). */
  subcategory?: string;
}

type LibraryResult =
  | LibrarySearchResult
  | LibraryListTagsResult
  | LibraryListCategoriesResult
  | LibraryBatchResult
  | ListPluginsResult;

/**
 * Search Live's browser library or enumerate available tags.
 *
 * The search action runs two sources in parallel:
 *  - sampleFolder scan (V8): the user-configured sampleFolder, when set
 *    AND filters don't require DB-only data (tags, non-audio kind, deviceKind).
 *  - DB query (Node): library.search route via requestNode RPC.
 * Results are merged and de-duplicated by absolute path. The sampleFolder
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

  if (action === "listCategories") {
    return await callRoute<LibraryListCategoriesResult>(
      "library.listCategories",
      { category: args.category, limit: args.limit },
    );
  }

  if (action === "searchBatch") {
    return await runSearchBatch(args.queries ?? [], toolContext, runSearch);
  }

  if (action === "listPlugins") {
    const category =
      args.deviceKind != null && PLUGIN_CATEGORIES.has(args.deviceKind)
        ? (args.deviceKind as PluginCategory)
        : undefined;

    return await callRoute<ListPluginsResult>("library.listPlugins", {
      query: args.query,
      vendor: args.vendor,
      format: args.format,
      category,
      subcategory: args.subcategory,
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
 * merging results. Exported so searchBatch can reuse the exact
 * single-search path (filters, folder-scan dedup, limit) per query.
 *
 * @param args - Tool arguments
 * @param ctx - Per-request context
 * @returns Merged LibrarySearchResult
 */
export async function runSearch(
  args: LibraryArgs,
  ctx: Partial<ToolContext>,
): Promise<LibrarySearchResult> {
  const folderScan = scanFolderItems(args, ctx);
  // source=sampleFolder bypasses the DB entirely; the response omits dbAvailable
  // to signal "did not consult the DB" instead of lying with `true`.
  const dbResult =
    args.source === "sampleFolder"
      ? null
      : await callRoute<LibrarySearchResult>("library.search", {
          query: args.query,
          tags: args.tags,
          kind: args.kind,
          type: args.type,
          deviceKind: args.deviceKind,
          source: args.source,
          inFolder: args.inFolder,
          sort: args.sort,
          limit: args.limit,
          verifyPaths: args.verifyPaths,
        });

  const folderPaths = new Set(folderScan.items.map((i) => i.path));
  const dbItems = (dbResult?.items ?? []).filter(
    (i) => !folderPaths.has(i.path),
  );
  const merged = sortItems([...folderScan.items, ...dbItems], args.sort);
  const limit = clampLibraryLimit(args.limit, DEFAULT_LIBRARY_LIMIT);
  const items = merged.slice(0, limit);
  const reason = folderScan.reason ?? dbResult?.reason;

  if (dbResult == null) {
    return reason == null ? { items } : { items, reason };
  }

  const base: LibrarySearchResult = {
    dbAvailable: dbResult.dbAvailable,
    // Propagate the stale-WAL advisory from the DB layer; omitted when absent.
    ...(dbResult.stalenessRisk && { stalenessRisk: dbResult.stalenessRisk }),
    items,
  };

  return reason == null ? base : { ...base, reason };
}

interface FolderScan {
  items: LibraryItem[];
  /** Set when items is empty due to a discoverable cause */
  reason?: string;
}

/**
 * Scan the configured sample folder when filters allow it and
 * convert results to LibraryItem shape. Returns a reason string when
 * the scan is skipped or fails for a user-actionable cause so callers
 * can surface diagnostics rather than reporting silent empty results.
 *
 * @param args - Tool arguments
 * @param ctx - Per-request context
 * @returns Folder scan result with items and optional reason
 */
function scanFolderItems(
  args: LibraryArgs,
  ctx: Partial<ToolContext>,
): FolderScan {
  const sampleFolder = ctx.sampleFolder;

  if (!sampleFolder) {
    if (args.source === "sampleFolder") {
      return {
        items: [],
        reason:
          "sample folder not configured (set one in the Producer Pal Setup tab)",
      };
    }

    return { items: [] };
  }

  // The folder scan can only satisfy: name substring + (implicit) audio kind.
  // Any DB-only filter means the user is not asking for sampleFolder content.
  if (args.source && args.source !== "sampleFolder") {
    return { items: [] };
  }

  if (args.tags) {
    return { items: [] };
  }

  // The folder scan has no tag data, so it can't honor a Type-tag filter.
  if (args.type) {
    return { items: [] };
  }

  if (args.kind && args.kind !== "audio") {
    return { items: [] };
  }

  if (args.deviceKind) {
    return { items: [] };
  }

  if (args.inFolder) {
    return { items: [] };
  }

  let result;

  try {
    result = readSamples({ search: args.query }, ctx);
  } catch (err) {
    return {
      items: [],
      reason: `sample folder scan failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const items: LibraryItem[] = result.samples.map((rel) => ({
    name: leafName(rel),
    path: `${result.sampleFolder}${rel}`,
    kind: "audio",
    tags: [],
    useCount: 0,
    source: "sampleFolder",
    folder: parentFolder(rel, result.sampleFolder),
    // These came from a live filesystem scan, so they exist by construction —
    // mark them without a redundant re-stat when the caller wants pathExists.
    ...(args.verifyPaths ? { pathExists: true } : {}),
  }));

  return { items };
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
 * Immediate parent folder display name for a sampleFolder item, mirroring
 * the `folder` field DB items carry. For a nested relative path the parent
 * is its last folder segment ("drums/kick.wav" → "drums"); for a top-level
 * file the parent is the configured sample folder's own basename.
 *
 * @param rel - Relative path like "drums/kick.wav"
 * @param sampleFolder - Absolute sample folder path (trailing slash)
 * @returns Parent folder display name
 */
function parentFolder(rel: string, sampleFolder: string): string {
  const idx = rel.lastIndexOf("/");

  if (idx !== -1) {
    return leafName(rel.slice(0, idx));
  }

  const trimmed = sampleFolder.endsWith("/")
    ? sampleFolder.slice(0, -1)
    : sampleFolder;

  return leafName(trimmed);
}

/**
 * Sort merged items. sampleFolder items are always grouped before DB items:
 * the sampleFolder is an explicit user choice, so those samples should
 * surface ahead of generic DB hits regardless of sort or useCount.
 *
 * @param items - Combined list of sampleFolder + DB items
 * @param sort - Sort enum (defaults to use_count)
 * @returns Sorted copy of items, sampleFolder partition first
 */
function sortItems(
  items: LibraryItem[],
  sort: LibrarySort | undefined,
): LibraryItem[] {
  const folder = items.filter((i) => i.source === "sampleFolder");
  const db = items.filter((i) => i.source !== "sampleFolder");

  return [...sortPartition(folder, sort), ...sortPartition(db, sort)];
}

/**
 * Sort a homogeneous partition (all folder or all DB items) by the
 * requested order. The DB partition trusts upstream ordering for
 * mod_date since LibraryItem has no mod_date field to re-sort by.
 *
 * Mirrors the SQL side in `orderByClause` (library-search.ts). When
 * adding a new LibrarySort variant, update BOTH sites — there is no
 * shared mapping table because one returns SQL and the other a Comparator.
 *
 * @param items - Partition to sort
 * @param sort - Sort enum
 * @returns Sorted copy
 */
function sortPartition(
  items: LibraryItem[],
  sort: LibrarySort | undefined,
): LibraryItem[] {
  if (sort === "name") {
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }

  if (sort === "mod_date") {
    // sampleFolder items have no mod_date metadata; fall back to name order.
    // DB items keep their upstream order (already mod_date-sorted by SQL).
    return items.every((i) => i.source === "sampleFolder")
      ? [...items].sort((a, b) => a.name.localeCompare(b.name))
      : [...items];
  }

  return [...items].sort(
    (a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name),
  );
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
