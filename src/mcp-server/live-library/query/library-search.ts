// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Structured search against Live's browser DB.
 *
 * Supports filtering by name substring, tags (AND-joined), content kind,
 * device kind, and source category. Reconstructs absolute paths and
 * resolves enum-friendly fields (kind, source) from raw DB encodings.
 *
 * The filter→WHERE assembly and row→LibraryItem conversion live in
 * candidate-query.ts so findSimilar/findDuplicates share the exact same
 * filter contract; this file owns search's ordering, limiting, and the
 * optional path verification.
 *
 * Read-only: SELECT statements only. Never write SQL, never ATTACH.
 */

import { stat } from "node:fs/promises";
import { detectStalenessRisk } from "../db-staleness.ts";
import {
  clampLibraryLimit,
  DEFAULT_LIBRARY_LIMIT,
  type LibraryItem,
  type LibrarySearchArgs,
  type LibrarySearchResult,
} from "../library-types.ts";
import { findLiveFilesDbPath } from "../live-db-path.ts";
import { openLiveDb } from "../live-db.ts";
import { resolveAbsolutePaths } from "../reconstruct-path.ts";
import {
  buildCandidateWhere,
  buildLibraryItem,
  CANDIDATE_COLUMNS,
  CANDIDATE_FROM,
  fetchTagsBulk,
  resolveFileIdForPath,
  type SearchRow,
} from "./candidate-query.ts";

/**
 * Run a structured library search.
 *
 * @param args - Filter parameters
 * @returns Result with merged items, plus dbAvailable flag for graceful
 *   fallback when Live's DB isn't installed.
 */
export async function librarySearch(
  args: LibrarySearchArgs = {},
): Promise<LibrarySearchResult> {
  const dbPath = await findLiveFilesDbPath();

  if (!dbPath) {
    return {
      dbAvailable: false,
      items: [],
      reason: "Live database not found",
    };
  }

  // Best-effort advisory: flag when an unclean Live exit left a pending WAL
  // that our immutable read can't see. Spread into every success return so the
  // signal sits at the top alongside dbAvailable; omitted when there's no risk.
  const stalenessRisk = await detectStalenessRisk(dbPath);

  // Guard the open + query: the f.subtype column (clip subtype) is the
  // most recently added column we SELECT, and Live's DB schema varies across
  // releases. An older DB lacking a selected column makes the SELECT throw, so
  // degrade to dbAvailable:false rather than surfacing a raw SQLite error to the
  // LLM. Mirrors listPlugins.
  try {
    const db = await openLiveDb(dbPath);

    try {
      // Treat inFolder="" as "no folder filter" (least-surprise): an empty
      // string would otherwise resolve to the DB's root row and silently
      // collapse the search to "immediate children of /".
      const inFolder =
        args.inFolder != null && args.inFolder !== "" ? args.inFolder : null;
      const resolvedParent =
        inFolder != null ? resolveFileIdForPath(db, inFolder) : undefined;

      // inFolder was provided but the path doesn't map to any known folder.
      // Set a reason so the LLM can distinguish "no matches under this folder"
      // from "this folder doesn't exist". Note: segment lookups are
      // case-insensitive (COLLATE NOCASE), so a path with bad casing still
      // resolves on case-insensitive filesystems.
      if (inFolder != null && resolvedParent == null) {
        return {
          dbAvailable: true,
          ...(stalenessRisk && { stalenessRisk }),
          items: [],
          reason: `inFolder path not found: ${inFolder}`,
        };
      }

      // At this point resolvedParent is either undefined (no inFolder) or a valid number
      const parentId: number | undefined = resolvedParent ?? undefined;
      const { sql, params } = buildSearchQuery(args, parentId);
      // node:sqlite returns `unknown[]`. We trust the SELECT column list to
      // match SearchRow — the SQL is hand-written and pinned by tests, so a
      // per-row runtime validator would be dead weight at the cost of
      // measurable overhead at limit=1000.
      const rows = db.prepare(sql).all(...params) as unknown as SearchRow[];
      const fileIds = rows.map((r) => r.file_id);
      const paths = resolveAbsolutePaths(db, fileIds);
      const tagsByFile = fetchTagsBulk(db, fileIds);
      const items = rows.map((row) => buildLibraryItem(row, paths, tagsByFile));

      if (args.verifyPaths) {
        await verifyItemPaths(items);
      }

      return {
        dbAvailable: true,
        ...(stalenessRisk && { stalenessRisk }),
        items,
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      dbAvailable: false,
      items: [],
      reason: `Failed to read Live database: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Stat each item's path and set `pathExists` so the caller can drop stale
 * entries. Runs in parallel — a warm-cache stat is sub-millisecond, so even a
 * full limit=1000 result set stays well under a second. Truncated paths are
 * skipped (their missing leading segments would always stat as not-found).
 *
 * @param items - Items to verify in place
 */
async function verifyItemPaths(items: LibraryItem[]): Promise<void> {
  // Resolve every stat first, then assign synchronously. Mutating each item
  // directly inside the async map trips require-atomic-updates (a false
  // positive here — items are distinct — but cheap to sidestep).
  const exists = await Promise.all(
    items.map((item) =>
      item.pathTruncated ? Promise.resolve(null) : pathExistsOnDisk(item.path),
    ),
  );

  for (const [i, item] of items.entries()) {
    const result = exists[i];

    if (result != null) item.pathExists = result;
  }
}

/**
 * Check whether a path exists on disk. Any stat error (ENOENT, EACCES, a
 * disconnected drive) is treated as "does not exist" — the point is whether
 * the caller can use the path, not why it can't.
 *
 * @param path - Absolute filesystem path
 * @returns true if stat succeeds, false on any error
 */
async function pathExistsOnDisk(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  } catch {
    return false;
  }
}

interface QueryPieces {
  sql: string;
  params: Array<string | number>;
}

/**
 * Compose the search SQL and its positional parameters from filter args:
 * the shared candidate WHERE plus search's own ORDER BY and LIMIT.
 *
 * @param args - Filter parameters
 * @param parentId - Resolved file_id for the inFolder constraint, when present
 * @returns SQL string and parameter array for prepared statement binding
 */
function buildSearchQuery(
  args: LibrarySearchArgs,
  parentId?: number,
): QueryPieces {
  const { where, params } = buildCandidateWhere(args, parentId);
  const orderBy = orderByClause(args.sort);
  const limit = clampLibraryLimit(args.limit, DEFAULT_LIBRARY_LIMIT);

  params.push(limit);

  const sql = `SELECT ${CANDIDATE_COLUMNS}
               FROM ${CANDIDATE_FROM}
               ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY ${orderBy}
               LIMIT ?`;

  return { sql, params };
}

/**
 * Map the public LibrarySort enum to a SQL ORDER BY clause.
 *
 * Mirrors the JS comparator side in `sortPartition` (library.ts). When
 * adding a new LibrarySort variant, update BOTH sites — there is no
 * shared mapping table because one returns SQL and the other a Comparator.
 *
 * Sort variants:
 *   - "name":      f.name ASC                                ↔ a.name.localeCompare(b.name)
 *   - "mod_date":  f.mod_date DESC, f.name ASC               ↔ (DB items trust upstream order)
 *   - "use_count": f.use_count DESC, f.mod_date DESC, name   ↔ b.useCount - a.useCount || name
 *
 * @param sort - Sort enum (defaults to use_count)
 * @returns SQL fragment safe to inline (no params)
 */
function orderByClause(sort: LibrarySearchArgs["sort"]): string {
  if (sort === "name") {
    return "f.name ASC";
  }

  if (sort === "mod_date") {
    return "f.mod_date DESC, f.name ASC";
  }

  // Default use_count sort: stable tiebreakers so a fresh user (where most
  // rows have use_count=0) doesn't fall back to whatever the index returns.
  return "f.use_count DESC, f.mod_date DESC, f.name ASC";
}
