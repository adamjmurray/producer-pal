// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type LibraryBatchEntry,
  type LibraryBatchQuery,
  type LibraryBatchResult,
  type LibrarySearchArgs,
  type LibrarySearchResult,
} from "#src/mcp-server/live-library/library-types.ts";
import * as console from "#src/shared/v8-max-console.ts";

/** Hard cap on queries per searchBatch call. Internal — not a user param.
 * Extra queries beyond this are dropped (warn-and-truncate) so a runaway
 * batch can't fan out into a flood of DB queries. */
export const MAX_BATCH_QUERIES = 20;

/**
 * Run many filtered library searches in one call, grouping each query's
 * results under its label. Each query reuses the exact single-search path
 * (via the injected runSearch), so filters, folder-scan dedup, and limit
 * behave identically to a standalone search. Query order is preserved and
 * a query with no matches yields an empty `items` entry (never dropped).
 *
 * The batch is capped at MAX_BATCH_QUERIES; extras are truncated with a
 * warning. The top-level dbAvailable reflects the global DB state: present
 * when any query consulted the DB, and false if any such query found the
 * DB missing.
 *
 * @param queries - Per-query filter sets (optional label each)
 * @param ctx - Per-request context carrying sampleFolder
 * @param runSearch - The single-search implementation to reuse per query
 * @returns Array-form batch result, one entry per query in order
 */
export async function runSearchBatch(
  queries: LibraryBatchQuery[],
  ctx: Partial<ToolContext>,
  runSearch: (
    args: LibrarySearchArgs,
    ctx: Partial<ToolContext>,
  ) => Promise<LibrarySearchResult>,
): Promise<LibraryBatchResult> {
  const capped = queries.slice(0, MAX_BATCH_QUERIES);

  if (queries.length > MAX_BATCH_QUERIES) {
    console.warn(
      `searchBatch: ${queries.length} queries exceeds cap of ${MAX_BATCH_QUERIES}; ignoring the extra ${queries.length - MAX_BATCH_QUERIES}`,
    );
  }

  const results: LibraryBatchEntry[] = [];
  let dbConsulted = false;
  let dbAvailable = true;

  for (const [index, q] of capped.entries()) {
    const { label, ...filters } = q;
    const searchResult = await runSearch(filters, ctx);

    if ("dbAvailable" in searchResult && searchResult.dbAvailable != null) {
      dbConsulted = true;
      dbAvailable &&= searchResult.dbAvailable;
    }

    const entry: LibraryBatchEntry = {
      label: label ?? String(index),
      items: searchResult.items,
    };

    results.push(
      searchResult.reason == null
        ? entry
        : { ...entry, reason: searchResult.reason },
    );
  }

  return dbConsulted ? { dbAvailable, results } : { results };
}
