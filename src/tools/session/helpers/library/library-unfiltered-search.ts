// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { splitEntries } from "#src/tools/shared/validation/lists/split-entries.ts";
import {
  type LibraryBatchQuery,
  type LibrarySearchArgs,
} from "#src/mcp-server/live-library/library-types.ts";

// The schema fills `kind` in, so audio can't be told from a kind the caller
// chose, and every audio file in the library isn't a narrower set.
const DEFAULT_KIND = "audio";

const FILTER_NAMES =
  "query, tags, type, deviceKind, source, inFolder, or a kind other than audio";

/**
 * Refuses a search that names nothing to look for: no query and no filter
 * would list the library's first files, which fills the model's context
 * without answering anything. Checks the single search or every `searches`
 * entry before any of them runs.
 * @param search - The single search's args
 * @param searches - The `searches` entries, when the call sent them
 * @param param - The name the caller sent them under
 * @throws Error naming the entries that have no query or filter
 */
export function refuseUnfilteredSearch(
  search: LibrarySearchArgs,
  searches: LibraryBatchQuery[] | undefined,
  param = "searches",
): void {
  if (searches == null) {
    if (!narrowsSearch(search)) {
      throw new Error(
        `search needs a query or a filter: with none it lists the library's first files. Add one of ${FILTER_NAMES}.`,
      );
    }

    return;
  }

  const bare = searches.flatMap((entry, index) =>
    narrowsSearch(entry) ? [] : [`"${entry.label ?? String(index)}"`],
  );
  const [verb, target] = bare.length === 1 ? ["has", "it"] : ["have", "each"];

  if (bare.length > 0) {
    throw new Error(
      `${param} ${bare.join(", ")} ${verb} no query or filter, so would list the library's first files. Add one of ${FILTER_NAMES} to ${target}.`,
    );
  }
}

/**
 * @param args - One search's filters
 * @returns Whether any of them narrows the search
 */
function narrowsSearch(args: LibrarySearchArgs): boolean {
  return (
    [args.query, args.inFolder].some(isGiven) ||
    // tags is a comma list, so "," alone names no tag.
    splitEntries(args.tags ?? "").some(isGiven) ||
    [args.type, args.deviceKind, args.source].some((value) => value != null) ||
    (args.kind != null && args.kind !== DEFAULT_KIND)
  );
}

/**
 * @param value - A string filter
 * @returns Whether it has something besides whitespace
 */
function isGiven(value: string | undefined): boolean {
  return value != null && value.trim() !== "";
}
