// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

import { errorMessage } from "#src/shared/error-utils.ts";
import { detectStalenessRisk } from "./db-staleness.ts";
import {
  clampLibraryLimit,
  DEFAULT_LIST_TAGS_LIMIT,
  type LibraryListTagsResult,
} from "./library-types.ts";
import { findLiveFilesDbPath } from "./live-db-path.ts";
import { openLiveDb } from "./live-db.ts";

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
      reason: "Live database not found",
    };
  }

  const limit = clampLibraryLimit(args.limit, DEFAULT_LIST_TAGS_LIMIT);
  // Best-effort advisory: flag a pending WAL from an unclean Live exit that our
  // immutable read can't see. Omitted from the response when there's no risk.
  const stalenessRisk = await detectStalenessRisk(dbPath);

  // Guard the open + query: Live's DB schema varies across releases, so a future
  // rename of the keywords/files tables or columns would throw a raw SQLite error
  // to the LLM. Degrade to dbAvailable:false instead. Mirrors librarySearch.
  try {
    const db = openLiveDb(dbPath);

    try {
      const rows = db
        .prepare(
          `SELECT kw.name AS name, COUNT(*) AS cnt
           FROM keywords k
           JOIN files kw ON kw.file_id = k.keyw_id
           GROUP BY k.keyw_id
           ORDER BY cnt DESC, kw.name ASC
           LIMIT ?`,
        )
        .all(limit) as unknown as TagRow[];
      const tags = rows.map((r) => ({ name: r.name, count: r.cnt }));

      return {
        dbAvailable: true,
        ...(stalenessRisk && { stalenessRisk }),
        tags,
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      dbAvailable: false,
      tags: [],
      reason: `Failed to read Live database: ${errorMessage(error)}`,
    };
  }
}
