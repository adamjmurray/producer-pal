// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
import { errorMessage } from "#src/shared/error-message.ts";
import { stalenessNote } from "../db-staleness.ts";
import { type DatabaseSync } from "node:sqlite";
import {
  clampLibraryLimit,
  clampLibraryOffset,
  DEFAULT_LIBRARY_LIMIT,
  MAX_SEARCH_LIMIT,
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
import { presetFolderNote } from "./notes/preset-folder-note.ts";
import { rackKindNote } from "./notes/rack-kind-note.ts";

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
      detail: "Live database not found",
    };
  }

  // Our immutable read misses what is still in Live's WAL; the note says so.
  const stale = await stalenessNote(dbPath);

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
      // Set a detail so the LLM can distinguish "no matches under this folder"
      // from "this folder doesn't exist". Note: segment lookups are
      // case-insensitive (COLLATE NOCASE), so a path with bad casing still
      // resolves on case-insensitive filesystems.
      if (inFolder != null && resolvedParent == null) {
        return {
          dbAvailable: true,
          ...(stale && { stalenessNote: stale }),
          items: [],
          detail: `inFolder path not found: ${inFolder}`,
        };
      }

      // At this point resolvedParent is either undefined (no inFolder) or a valid number
      const parentId: number | undefined = resolvedParent ?? undefined;
      const { rows, more } = searchPage(db, args, parentId);
      const fileIds = rows.map((r) => r.file_id);
      const paths = resolveAbsolutePaths(db, fileIds);
      const tagsByFile = fetchTagsBulk(db, fileIds);
      const items = rows.map((row) => buildLibraryItem(row, paths, tagsByFile));
      const offset = clampLibraryOffset(args.offset);

      if (args.verifyPaths) {
        await verifyItemPaths(items);
      }

      const notes = [
        presetFolderNote(db, args, parentId),
        rackKindNote(db, args, parentId, offset + items.length),
      ].filter((n) => n != null);
      const note = notes.length > 0 ? notes.join("; ") : undefined;

      return {
        dbAvailable: true,
        ...(stale && { stalenessNote: stale }),
        items,
        ...(more != null && { more }),
        ...(note != null && { note }),
      };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      dbAvailable: false,
      items: [],
      detail: `Failed to read Live database: ${errorMessage(error)}`,
    };
  }
}

/**
 * Stat each item's path and set `pathExists` so the caller can drop stale
 * entries. Runs in parallel — a warm-cache stat is sub-millisecond, so even a
 * full limit=200 result set stays well under a second. Truncated paths are
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

    if (result != null) {
      item.pathExists = result;
    }
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

/**
 * Read one page of matches. It asks for a row past the page: finding one means
 * more matches follow, and only then are they counted (the count is a few
 * milliseconds, so a search that fits its page never pays for it).
 *
 * @param db - Open database handle
 * @param args - Filter parameters, including limit and offset
 * @param parentId - Resolved file_id for the inFolder constraint, when present
 * @returns The page's rows, and how many matches lie beyond it (omitted if none)
 */
function searchPage(
  db: DatabaseSync,
  args: LibrarySearchArgs,
  parentId?: number,
): { rows: SearchRow[]; more?: number } {
  const { where, params } = buildCandidateWhere(args, parentId);
  const limit = clampLibraryLimit(
    args.limit,
    DEFAULT_LIBRARY_LIMIT,
    MAX_SEARCH_LIMIT,
  );
  const offset = clampLibraryOffset(args.offset);
  // buildCandidateWhere always emits at least the file_type filter.
  const from = `${CANDIDATE_FROM} WHERE ${where.join(" AND ")}`;
  // node:sqlite returns `unknown[]`. We trust the SELECT column list to
  // match SearchRow — the SQL is hand-written and pinned by tests, so a
  // per-row runtime validator would be dead weight at the cost of
  // measurable overhead at limit=200.
  const fetched = db
    .prepare(
      `SELECT ${CANDIDATE_COLUMNS}
       FROM ${from}
       ORDER BY ${orderByClause(args.sort)}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit + 1, offset) as unknown as SearchRow[];

  if (fetched.length <= limit) {
    return { rows: fetched };
  }

  const { n } = db
    .prepare(`SELECT COUNT(*) AS n FROM ${from}`)
    .get(...params) as { n: number };

  return {
    rows: fetched.slice(0, limit),
    more: Math.max(n - offset - limit, 1),
  };
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
 *   - "mod-date":  f.mod_date DESC, f.name ASC               ↔ (DB items trust upstream order)
 *   - "use-count": f.use_count DESC, f.mod_date DESC, name   ↔ b.useCount - a.useCount || name
 *
 * Every order ends on file_id so the page boundary is stable: with ties left
 * to the engine, a file could land on two pages or none.
 *
 * @param sort - Sort enum (defaults to use-count)
 * @returns SQL fragment safe to inline (no params)
 */
function orderByClause(sort: LibrarySearchArgs["sort"]): string {
  if (sort === "name") {
    return "f.name ASC, f.file_id ASC";
  }

  if (sort === "mod-date") {
    return "f.mod_date DESC, f.name ASC, f.file_id ASC";
  }

  // Default use-count sort: stable tiebreakers so a fresh user (where most
  // rows have use_count=0) doesn't fall back to whatever the index returns.
  return "f.use_count DESC, f.mod_date DESC, f.name ASC, f.file_id ASC";
}
