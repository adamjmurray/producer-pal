// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Enumerate Live's tag vocabulary so the LLM can discover what tags
 * exist on the user's machine before constructing a tag-filtered search.
 *
 * Tags live in the `keywords` table as (file_id, keyw_id) pairs where
 * keyw_id is itself a `files.file_id` of a row whose file_type='keyw'.
 * The tag NAME is `files.name` of that keyw row.
 *
 * Read-only: SELECT statements only.
 */

import { type DatabaseSync } from "node:sqlite";
import { errorMessage } from "#src/shared/error-message.ts";
import { stalenessNote } from "./db-staleness.ts";
import {
  clampLibraryLimit,
  DEFAULT_LIST_TAGS_LIMIT,
  type LibraryListTagsResult,
} from "./library-types.ts";
import { findLiveFilesDbPath } from "./live-db-path.ts";
import { openLiveDb } from "./live-db.ts";
import { COUNTED_FOR_TAG, IN_A_PLACE } from "./query/candidate-query.ts";

export interface ListTagsArgs {
  limit?: number;
}

interface TagRow {
  name: string;
  cnt: number;
}

/**
 * Return the most-used tags on the user's machine, sorted by count desc.
 *
 * @param args - Optional limit override
 * @returns Tag list with counts, or dbAvailable: false when Live isn't installed.
 */
export async function listTags(
  args: ListTagsArgs = {},
): Promise<LibraryListTagsResult> {
  const dbPath = await findLiveFilesDbPath();

  if (!dbPath) {
    return {
      dbAvailable: false,
      tags: [],
      detail: "Live database not found",
    };
  }

  const limit = clampLibraryLimit(args.limit, DEFAULT_LIST_TAGS_LIMIT);
  // Our immutable read misses what is still in Live's WAL; the note says so.
  const stale = await stalenessNote(dbPath);

  // Guard the open + query: Live's DB schema varies across releases, so a future
  // rename of the keywords/files tables or columns would throw a raw SQLite error
  // to the LLM. Degrade to dbAvailable:false instead. Mirrors librarySearch.
  try {
    const db = await openLiveDb(dbPath);

    try {
      const grouped = `SELECT kw.name AS name, COUNT(*) AS cnt
           FROM keywords k
           JOIN files kw ON kw.file_id = k.keyw_id
           JOIN files f ON f.file_id = k.file_id
           WHERE ${IN_A_PLACE} AND ${COUNTED_FOR_TAG}
           GROUP BY k.keyw_id`;
      // One row past the page tells us whether anything was cut off; only then
      // is the full tag count worth running (as in search).
      const rows = db
        .prepare(`${grouped} ORDER BY cnt DESC, kw.name ASC LIMIT ?`)
        .all(limit + 1) as unknown as TagRow[];
      const tags = rows
        .slice(0, limit)
        .map((r) => ({ name: r.name, count: r.cnt }));
      const more =
        rows.length > limit ? countGroups(db, grouped, []) - limit : 0;

      return {
        dbAvailable: true,
        ...(stale && { stalenessNote: stale }),
        tags,
        ...(more > 0 && { more }),
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      dbAvailable: false,
      tags: [],
      detail: `Failed to read Live database: ${errorMessage(error)}`,
    };
  }
}

/**
 * Count the rows a GROUP BY query returns, so a list that hit its limit can say
 * how many it left out.
 *
 * @param db - Open database handle
 * @param groupedSql - The query, without ORDER BY or LIMIT
 * @param params - Values for the query's placeholders
 * @returns Number of groups
 */
export function countGroups(
  db: DatabaseSync,
  groupedSql: string,
  params: Array<string | number>,
): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM (${groupedSql})`)
    .get(...params) as { n: number };

  return row.n;
}
