// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type LibraryBatchEntry,
  type LibraryBatchQuery,
  type LibraryBatchResult,
  type LibrarySearchArgs,
  type LibraryToolSearchResult,
} from "#src/mcp-server/live-library/library-types.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { emitWarning } from "#src/shared/max/v8-max-console.ts";

/** Hard cap on queries per `searches` fan-out. Internal — not a user param.
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
 * @returns One entry per query in order, or a lone query's result unwrapped
 */
export async function runSearchBatch(
  queries: LibraryBatchQuery[],
  ctx: Partial<ToolContext>,
  runSearch: (
    args: LibrarySearchArgs,
    ctx: Partial<ToolContext>,
  ) => Promise<LibraryToolSearchResult>,
): Promise<LibraryBatchResult | LibraryToolSearchResult> {
  const capped = queries.slice(0, MAX_BATCH_QUERIES);

  if (queries.length > MAX_BATCH_QUERIES) {
    emitWarning(
      `searches: ${queries.length} queries exceeds cap of ${MAX_BATCH_QUERIES}; ignoring the extra ${queries.length - MAX_BATCH_QUERIES}`,
    );
  }

  const results: LibraryBatchEntry[] = [];
  let dbConsulted = false;
  let dbAvailable = true;
  // Staleness is one property of the DB at request time: keep the first note,
  // since every query in the batch sees the same state.
  let stalenessNote: string | undefined;
  // Labels group results in the response, so duplicates (two queries both
  // labeled "Kicks", or a provided label colliding with an index fallback)
  // would make entries indistinguishable. Suffix collisions with #2, #3, … so
  // every entry stays addressable; the first occurrence keeps the bare label.
  const usedLabels = new Set<string>();

  for (const [index, q] of capped.entries()) {
    const { label, ...filters } = q;
    const resolvedLabel = dedupeLabel(label ?? String(index), usedLabels);
    // Guard each query independently: a thrown error in one query (envelope
    // failure, a runSearch impl that doesn't honor the graceful dbAvailable:false
    // contract, etc.) must not discard the entries that already succeeded. The
    // promise on this function — every query yields an entry, never dropped —
    // is the load-bearing one for the LLM's batch-results contract.
    let searchResult: LibraryToolSearchResult;

    try {
      searchResult = await runSearch(filters, ctx);
    } catch (err) {
      results.push({
        label: resolvedLabel,
        items: [],
        detail: errorMessage(err),
      });
      continue;
    }

    if ("dbAvailable" in searchResult && searchResult.dbAvailable != null) {
      dbConsulted = true;
      dbAvailable &&= searchResult.dbAvailable;
    }

    stalenessNote ??= searchResult.stalenessNote;

    const entry: LibraryBatchEntry = {
      label: resolvedLabel,
      items: searchResult.items,
    };

    results.push({
      ...entry,
      ...paging(searchResult),
      ...(searchResult.detail != null && { detail: searchResult.detail }),
      ...(searchResult.note != null && { note: searchResult.note }),
    });
  }

  const envelope = {
    ...(dbConsulted && { dbAvailable }),
    ...(dbConsulted && stalenessNote != null && { stalenessNote }),
  };

  // One search needs no grouping, so it answers in the shape a plain search
  // does. An array where the caller asked for one thing confuses small models.
  if (results.length === 1) {
    const [{ items, more, nextOffset, detail, note }] = results as [
      LibraryBatchEntry,
    ];

    return {
      ...envelope,
      items,
      ...(more != null && { more, nextOffset }),
      ...(detail != null && { detail }),
      ...(note != null && { note }),
    };
  }

  return { ...envelope, results };
}

/**
 * @param result - One search's result
 * @returns Its paging fields, when matches lie beyond its page
 */
function paging(
  result: LibraryToolSearchResult,
): Pick<LibraryBatchEntry, "more" | "nextOffset"> {
  return result.more == null
    ? {}
    : { more: result.more, nextOffset: result.nextOffset };
}

/**
 * Resolve a unique label, suffixing `#2`, `#3`, … on collision. The set is
 * mutated to record the chosen label so later queries see it as taken (this
 * also guards against a `#N` suffix colliding with a later bare label).
 *
 * @param base - The query's provided label, or its index as a string
 * @param used - Labels already assigned in this batch (mutated)
 * @returns A label not yet present in `used`
 */
function dedupeLabel(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;

  while (used.has(candidate)) {
    candidate = `${base}#${suffix}`;
    suffix += 1;
  }

  used.add(candidate);

  return candidate;
}
