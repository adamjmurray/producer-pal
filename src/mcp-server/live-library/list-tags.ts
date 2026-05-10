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

import { type LibraryListTagsResult } from "./library-types.ts";
import { findLiveFilesDbPath } from "./live-db-path.ts";
import { openLiveDb } from "./live-db.ts";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1_000;

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
      source: "live-db",
      dbAvailable: false,
      tags: [],
      reason: "Live database not found",
    };
  }

  const limit = clampLimit(args.limit);
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

    return { source: "live-db", dbAvailable: true, tags };
  } finally {
    db.close();
  }
}

/**
 * Clamp a requested limit to safe bounds.
 *
 * @param requested - User-supplied limit
 * @returns Limit between 1 and MAX_LIMIT
 */
function clampLimit(requested: number | undefined): number {
  if (requested == null || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(requested), MAX_LIMIT);
}
