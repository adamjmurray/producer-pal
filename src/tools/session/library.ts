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
import { multiWordQueryNote } from "./helpers/library/multi-word-query-note.ts";
import { trimLibraryItems } from "./helpers/library/library-item-trim.ts";
import { refuseUnfilteredSearch } from "./helpers/library/library-unfiltered-search.ts";
import { runSearchBatch } from "./library-search-batch.ts";

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
 * @param args - Tool arguments (action + filters)
 * @returns Search result or tag list, depending on action
 */
export async function library(args: LibraryArgs = {}): Promise<LibraryResult> {
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
    return await runSearchBatch(searches, runSearch, searchesParam);
  }

  return await runSearch(args);
}

/**
 * Run a structured search against Live's DB. Exported so the searches fan-out
 * can reuse the exact single-search path (filters, limit) per query.
 *
 * @param args - Tool arguments
 * @returns The result, its items trimmed of what the request already says
 */
export async function runSearch(
  args: LibraryArgs,
): Promise<LibraryToolSearchResult> {
  const limit = clampLibraryLimit(
    args.limit,
    DEFAULT_LIBRARY_LIMIT,
    MAX_SEARCH_LIMIT,
  );
  const offset = clampLibraryOffset(args.offset);
  const dbResult = await callRoute<LibrarySearchResult>("library.search", {
    query: args.query,
    tags: args.tags,
    kind: args.kind,
    type: args.type,
    deviceKind: args.deviceKind,
    source: args.source,
    inFolder: args.inFolder,
    sort: args.sort,
    offset,
    limit,
    verifyPaths: args.verifyPaths,
  });
  const more = dbResult.more ?? 0;
  // Sort on the full fields, then trim. The DB cut its window in SQL order;
  // this re-sorts the page by the JS rules (localeCompare on names).
  const items = trimLibraryItems(sortItems(dbResult.items, args.sort), args);
  const detail = dbResult.detail ?? pastTheEnd(offset, items, more);
  // A detail already says why nothing came back, so the query's shape isn't
  // the news.
  const queryNote =
    detail == null
      ? multiWordQueryNote(args.query, offset + items.length)
      : undefined;
  const note = [dbResult.note, queryNote].filter((n) => n != null).join("; ");

  return {
    dbAvailable: dbResult.dbAvailable,
    ...(dbResult.stalenessNote != null && {
      stalenessNote: dbResult.stalenessNote,
    }),
    items,
    ...(more > 0 && { more, nextOffset: offset + limit }),
    ...(note !== "" && { note }),
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

/**
 * Sort one page of results by the requested order. The DB trusts upstream
 * ordering for mod-date since LibraryItem has no mod_date field to re-sort by.
 *
 * Mirrors the SQL side in `orderByClause` (library-search.ts). When adding a
 * new LibrarySort variant, update BOTH sites — there is no shared mapping
 * table because one returns SQL and the other a Comparator.
 *
 * @param items - Page of items to sort
 * @param sort - Sort enum (defaults to use-count)
 * @returns Sorted copy
 */
function sortItems(
  items: LibraryItem[],
  sort: LibrarySort | undefined,
): LibraryItem[] {
  if (sort === "name") {
    return items.toSorted((a, b) => a.name.localeCompare(b.name));
  }

  if (sort === "mod-date") {
    return [...items];
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
