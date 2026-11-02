// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import {
  clampLibraryLimit,
  clampLibraryOffset,
  DEFAULT_LIBRARY_LIMIT,
  MAX_SEARCH_LIMIT,
  type LibraryBatchQuery,
  type LibraryBatchResult,
  type LibraryDeviceKind,
  type LibraryFindDuplicatesResult,
  type LibraryFindSimilarResult,
  type LibraryItem,
  type LibraryListCategoriesResult,
  type LibraryListTagsResult,
  type LibrarySearchArgs,
  type LibrarySearchResult,
  type LibrarySort,
  type LibraryToolSearchResult,
  type ListPluginsResult,
  type PluginCategory,
  type PluginFormat,
} from "#src/mcp-server/live-library/library-types.ts";
import { emitWarning } from "#src/shared/max/v8-max-console.ts";
import { refuseLibraryParamsOutsideAction } from "./helpers/library/library-action-params.ts";
import { trimLibraryItems } from "./helpers/library/library-item-trim.ts";
import { refuseUnfilteredSearch } from "./helpers/library/library-unfiltered-search.ts";
import { runSearchBatch } from "./library-search-batch.ts";
import { readSamples } from "./read-samples.ts";
import { errorMessage } from "#src/shared/error-message.ts";

// The source that bypasses Live's DB for the user's sample folder.
const SAMPLE_FOLDER = "sample-folder";

// deviceKind doubles as the plugin category filter for list-plugins. Only the
// values plugins can actually be (instrument/audiofx) map through; midifx has
// no plugin-category equivalent, so list-plugins refuses it.
const PLUGIN_CATEGORIES = new Set<LibraryDeviceKind>(["instrument", "audiofx"]);

// Shares the search-filter fields (query/tags/kind/…/verifyPaths) with
// LibrarySearchArgs via extends; only the action-specific fields are added here.
interface LibraryArgs extends LibrarySearchArgs {
  // Typed as plain string (not the enum) so the runtime "Unknown action"
  // guard below — defense against the V8 adapter forwarding unvalidated
  // input — remains reachable.
  action?: string;
  /** list-categories only: top-level category to drill into. */
  category?: string;
  /** find-similar only: absolute path of the seed sample to rank others against. */
  similarTo?: string;
  /** search only: per-query filter sets to fan out over (see runSearchBatch). */
  searches?: LibraryBatchQuery[];
  /** Hidden alias for searches: the name the fan-out shipped under. */
  queries?: LibraryBatchQuery[];
  /** list-plugins only: vendor/manufacturer substring filter. */
  vendor?: string;
  /** list-plugins only: restrict to a single plugin format. */
  format?: PluginFormat;
  /** list-plugins only: subcategory substring filter (case-insensitive). */
  subcategory?: string;
}

type LibraryResult =
  | LibraryToolSearchResult
  | LibraryListTagsResult
  | LibraryListCategoriesResult
  | LibraryBatchResult
  | ListPluginsResult
  | LibraryFindSimilarResult
  | LibraryFindDuplicatesResult;

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
  const action = resolveAction(args.action);
  const searches = args.searches ?? args.queries;
  // The name the caller sent the list under, for an error that quotes it.
  const searchesParam = args.searches != null ? "searches" : "queries";

  refuseLibraryParamsOutsideAction(action, args);

  if (searches?.length === 0) {
    // An empty list names no search at all, so there is nothing to guess at.
    throw new Error(`${searchesParam} must name at least one search`);
  }

  if (action === "list-tags") {
    return await callRoute<LibraryListTagsResult>("library.listTags", {
      limit: args.limit,
    });
  }

  if (action === "list-categories") {
    return await callRoute<LibraryListCategoriesResult>(
      "library.listCategories",
      { category: args.category, limit: args.limit },
    );
  }

  if (action === "list-plugins") {
    // Plugins are classified as instrument or audiofx only: Live's plugin DB
    // has no MIDI effect category, so that filter could only match nothing.
    if (args.deviceKind != null && !PLUGIN_CATEGORIES.has(args.deviceKind)) {
      throw new Error(
        `deviceKind "${args.deviceKind}" doesn't apply to action "list-plugins": plugins are "instrument" or "audiofx". Use one of those or drop deviceKind.`,
      );
    }

    const category = args.deviceKind as PluginCategory | undefined;

    return await callRoute<ListPluginsResult>("library.listPlugins", {
      query: args.query,
      vendor: args.vendor,
      format: args.format,
      category,
      subcategory: args.subcategory,
      limit: args.limit,
    });
  }

  if (action === "find-similar") {
    return await callRoute<LibraryFindSimilarResult>("library.findSimilar", {
      similarTo: args.similarTo,
      ...candidateFilters(args),
    });
  }

  if (action === "find-duplicates") {
    return await callRoute<LibraryFindDuplicatesResult>(
      "library.findDuplicates",
      candidateFilters(args),
    );
  }

  if (action !== "search") {
    throw new Error(`Unknown action: ${action}`);
  }

  refuseUnfilteredSearch(args, searches, searchesParam);

  // searches is the fan-out form of a search: each entry carries its own
  // filters, so the top-level ones don't apply.
  if (searches != null) {
    return await runSearchBatch(
      searches,
      toolContext,
      runSearch,
      searchesParam,
    );
  }

  return await runSearch(args, toolContext);
}

/**
 * Run a structured search against the configured folder + Live's DB,
 * merging results. Exported so the searches fan-out can reuse the exact
 * single-search path (filters, folder-scan dedup, limit) per query.
 *
 * Paging runs over the folder's matches followed by the DB's, so a page is a
 * window on that stream: folder items fill it first, the DB asks for the rest.
 * A DB file the folder scan also found is dropped from its page rather than
 * moved, which keeps the pages from overlapping or skipping (a page can then
 * come back short).
 *
 * @param args - Tool arguments
 * @param ctx - Per-request context
 * @returns Merged result, its items trimmed of what the request already says
 */
export async function runSearch(
  args: LibraryArgs,
  ctx: Partial<ToolContext>,
): Promise<LibraryToolSearchResult> {
  const folderScan = scanFolderItems(args, ctx);
  const limit = clampLibraryLimit(
    args.limit,
    DEFAULT_LIBRARY_LIMIT,
    MAX_SEARCH_LIMIT,
  );
  const offset = clampLibraryOffset(args.offset);
  const end = offset + limit;
  // Sorted on the full fields before the page is cut and trimmed.
  const folderItems = sortItems(folderScan.items, args.sort);
  const folderPage = folderItems.slice(offset, end);
  const folderLeft = Math.max(0, folderItems.length - end);
  // source=sample-folder bypasses the DB entirely; the response omits dbAvailable
  // to signal "did not consult the DB" instead of lying with `true`.
  const dbResult =
    args.source === SAMPLE_FOLDER
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
          // The DB rows start where the folder's end. A full page of folder
          // items still asks for one DB row, to learn whether any follow.
          offset: Math.max(0, offset - folderItems.length),
          limit: Math.max(1, limit - folderPage.length),
          verifyPaths: args.verifyPaths,
        });

  // Case-insensitive dedup: V8-in-Max only runs on macOS/Windows, whose
  // default filesystems (APFS, NTFS) are case-insensitive — so the same file
  // can surface with different casing from the folder scan vs Live's DB
  // (which records paths as written at index time). Mirrors the SQL side's
  // `COLLATE NOCASE` on inFolder.
  const folderPaths = new Set(folderItems.map((i) => i.path.toLowerCase()));
  const dbRows = dbResult?.items ?? [];
  const dbSlots = limit - folderPage.length;
  const dbPage = dbRows
    .slice(0, dbSlots)
    .filter((i) => !folderPaths.has(i.path.toLowerCase()));
  // Beyond the page: what follows the DB window, plus the probe row when the
  // folder filled the page. The count can include a file both sources list.
  const dbLeft = dbRows.slice(dbSlots).length + (dbResult?.more ?? 0);
  const more = folderLeft + dbLeft;
  // Sort on the full fields, then trim. The DB cut its window in SQL order;
  // this re-sorts the page by the JS rules (localeCompare on names).
  const items = trimLibraryItems(
    sortItems([...folderPage, ...dbPage], args.sort),
    args,
  );
  const detail =
    folderScan.detail ?? dbResult?.detail ?? pastTheEnd(offset, items, more);
  const paging = more > 0 ? { more, nextOffset: end } : {};

  if (dbResult == null) {
    return { items, ...paging, ...(detail != null && { detail }) };
  }

  return {
    dbAvailable: dbResult.dbAvailable,
    ...(dbResult.stalenessNote != null && {
      stalenessNote: dbResult.stalenessNote,
    }),
    items,
    ...paging,
    ...(dbResult.note != null && { note: dbResult.note }),
    ...(detail != null && { detail }),
  };
}

/**
 * Say so when a page past the first came back empty with nothing after it, so
 * an offset beyond the last match isn't read as "no matches at all".
 *
 * @param offset - Matches skipped
 * @param items - The page
 * @param more - Matches beyond the page
 * @returns The detail, or undefined when it doesn't apply
 */
function pastTheEnd(
  offset: number,
  items: unknown[],
  more: number,
): string | undefined {
  return offset > 0 && items.length === 0 && more === 0
    ? `offset ${offset} is past the last match`
    : undefined;
}

/**
 * The action to dispatch on. search-batch is what the fan-out shipped as before
 * it folded into search + `searches`; still honored so a caller on the old
 * spelling gets the fan-out instead of an error, but warned since it's retired.
 *
 * @param action - The action as validated (old spellings already rewritten)
 * @returns The action to run
 */
function resolveAction(action: string | undefined): string {
  if (action === "search-batch") {
    emitWarning(
      'action "search-batch" is deprecated and will be removed; use action "search" with searches instead',
    );

    return "search";
  }

  return action ?? "search";
}

interface FolderScan {
  items: LibraryItem[];
  /** Set when items is empty due to a discoverable cause */
  detail?: string;
}

/**
 * Scan the configured sample folder when filters allow it and
 * convert results to LibraryItem shape. Returns a detail string when
 * the scan is skipped or fails for a user-actionable cause so callers
 * can surface diagnostics rather than reporting silent empty results.
 *
 * @param args - Tool arguments
 * @param ctx - Per-request context
 * @returns Folder scan result with items and optional detail
 */
function scanFolderItems(
  args: LibraryArgs,
  ctx: Partial<ToolContext>,
): FolderScan {
  const sampleFolder = ctx.sampleFolder;

  if (!sampleFolder) {
    if (args.source === SAMPLE_FOLDER) {
      return {
        items: [],
        detail:
          "sample folder not configured (set one in the Producer Pal Setup tab)",
      };
    }

    return { items: [] };
  }

  // The folder scan can only satisfy: name substring + (implicit) audio kind.
  // Any DB-only filter means the user is not asking for sampleFolder content.
  if (args.source && args.source !== SAMPLE_FOLDER) {
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
      detail: `sample folder scan failed: ${errorMessage(err)}`,
    };
  }

  const items: LibraryItem[] = result.samples.map((rel) => ({
    name: leafName(rel),
    path: `${result.sampleFolder}${rel}`,
    kind: "audio",
    tags: [],
    useCount: 0,
    source: SAMPLE_FOLDER,
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
 * Sort merged items. sampleFolder items are always grouped before DB items:
 * the sampleFolder is an explicit user choice, so those samples should
 * surface ahead of generic DB hits regardless of sort or useCount.
 *
 * @param items - Combined list of sampleFolder + DB items
 * @param sort - Sort enum (defaults to use-count)
 * @returns Sorted copy of items, sampleFolder partition first
 */
function sortItems(
  items: LibraryItem[],
  sort: LibrarySort | undefined,
): LibraryItem[] {
  const folder = items.filter((i) => i.source === SAMPLE_FOLDER);
  const db = items.filter((i) => i.source !== SAMPLE_FOLDER);

  return [...sortPartition(folder, sort), ...sortPartition(db, sort)];
}

/**
 * Sort a homogeneous partition (all folder or all DB items) by the
 * requested order. The DB partition trusts upstream ordering for
 * mod-date since LibraryItem has no mod_date field to re-sort by.
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
    return items.toSorted((a, b) => a.name.localeCompare(b.name));
  }

  if (sort === "mod-date") {
    // sample-folder items have no mod_date metadata; fall back to name order.
    // DB items keep their upstream order (already mod_date-sorted by SQL).
    return items.every((i) => i.source === SAMPLE_FOLDER)
      ? items.toSorted((a, b) => a.name.localeCompare(b.name))
      : [...items];
  }

  return items.toSorted(
    (a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name),
  );
}

/**
 * The search-filter subset that findSimilar and findDuplicates pass through to
 * constrain their candidate set (everything except search-only sort/verifyPaths
 * and the seed itself). Keeps the two dispatch branches from repeating the list.
 *
 * @param args - Tool arguments
 * @returns The candidate-constraining filters
 */
function candidateFilters(args: LibraryArgs): object {
  return {
    query: args.query,
    tags: args.tags,
    kind: args.kind,
    type: args.type,
    deviceKind: args.deviceKind,
    source: args.source,
    inFolder: args.inFolder,
    limit: args.limit,
  };
}

/**
 * Invoke a Node-side route and unwrap the response, throwing on failure
 * so the MCP error path renders a clean message instead of leaking the
 * RPC envelope shape to the LLM. Every route also gets the running Live
 * version, which Node uses to pick that install's library database.
 *
 * @param route - Route name registered on Node side
 * @param routeArgs - Arguments to pass to the route
 * @returns Route's success payload
 */
async function callRoute<T>(route: string, routeArgs: object): Promise<T> {
  // Node can't ask Live anything, and it needs the running major to pick the
  // right Live database when two majors are installed (see live-db-path.ts).
  // Read per call rather than caching: a LiveAPI object must not outlive the
  // request, and the call is cheap.
  // Live 12.4 returns "12.4", which V8 coerces to a number; force string.
  const liveVersion = String(
    LiveAPI.from("live_app").call("get_version_string"),
  );
  const response = await requestNode<T>(route, { ...routeArgs, liveVersion });

  if (!response.success || !response.result) {
    throw new Error(response.error ?? "unknown error");
  }

  return response.result;
}
