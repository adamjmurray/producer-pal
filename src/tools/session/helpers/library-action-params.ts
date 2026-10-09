// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type ParamHome,
  paramWasSent,
  refuseParamsOutsideAction,
} from "#src/tools/shared/schema/refuse-params-outside-action.ts";

// The actions that rank or group a filtered candidate set, so they take the
// search filters too.
const FILTERED = ["search", "find-similar", "find-duplicates"];
const LIST_PLUGINS_ACTION = "list-plugins";

const FILTER: ParamHome = { action: FILTERED };
const SEARCH: ParamHome = { action: ["search"] };
const LIST_PLUGINS: ParamHome = { action: [LIST_PLUGINS_ACTION] };

// Every param that only some actions read. `limit` is read by all of them.
const LIBRARY_PARAM_HOMES: Record<string, ParamHome> = {
  query: { action: [...FILTERED, LIST_PLUGINS_ACTION] },
  deviceKind: { action: [...FILTERED, LIST_PLUGINS_ACTION] },
  tags: FILTER,
  kind: FILTER,
  type: FILTER,
  source: FILTER,
  inFolder: FILTER,
  sort: SEARCH,
  verifyPaths: SEARCH,
  searches: SEARCH,
  queries: SEARCH,
  similarTo: { action: ["find-similar"] },
  category: { action: ["list-categories"] },
  vendor: LIST_PLUGINS,
  format: LIST_PLUGINS,
  subcategory: LIST_PLUGINS,
};

// The schema fills `kind` in, so a caller who sent nothing and one who sent
// the default look the same. Only a different kind counts as sent.
const DEFAULT_KIND = "audio";

// The filters a plain search takes at the top level. `searches` carries its own
// set per entry.
const SINGLE_SEARCH_FILTERS = [
  "query",
  "tags",
  "kind",
  "type",
  "deviceKind",
  "source",
  "inFolder",
  "sort",
  "verifyPaths",
  "limit",
];

/**
 * Refuses a library call that sends a param its action doesn't read, or that
 * sends top-level search filters beside `searches`.
 * @param action - The action the call will run
 * @param args - The args as sent
 */
export function refuseLibraryParamsOutsideAction(
  action: string,
  args: object,
): void {
  const sent: Record<string, unknown> = { ...args };

  if (sent.kind === DEFAULT_KIND) {
    delete sent.kind;
  }

  refuseParamsOutsideAction({ action }, sent, LIBRARY_PARAM_HOMES);
  refuseFiltersBesideSearches(sent);
}

/**
 * Whether the call can't say which filters apply: the top-level ones or the
 * ones inside each search.
 * @param sent - The args as sent
 * @throws Error naming the top-level filters
 */
function refuseFiltersBesideSearches(sent: Record<string, unknown>): void {
  const searches = ["searches", "queries"].find((name) => sent[name] != null);
  const filters = SINGLE_SEARCH_FILTERS.filter((name) =>
    paramWasSent(sent[name]),
  );

  if (searches == null || filters.length === 0) {
    return;
  }

  throw new Error(
    `${filters.join(", ")} can't be sent beside ${searches}: each entry of ` +
      `${searches} takes its own filters. Put them in the entries, or drop ${searches}.`,
  );
}
