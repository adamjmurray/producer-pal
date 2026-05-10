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
 * Read-only: SELECT statements only. Never write SQL, never ATTACH.
 */

import { type DatabaseSync } from "node:sqlite";
import {
  allKnownKindFourCCs,
  deviceTypeForKind,
  folderKindsForSource,
  fourCCsForKind,
  resolveKind,
  resolveSource,
} from "./library-filters.ts";
import {
  type LibraryItem,
  type LibrarySearchArgs,
  type LibrarySearchResult,
} from "./library-types.ts";
import { findLiveFilesDbPath } from "./live-db-path.ts";
import { openLiveDb } from "./live-db.ts";
import { resolveAbsolutePaths } from "./reconstruct-path.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1_000;

interface SearchRow {
  file_id: number;
  parent_id: number;
  name: string;
  use_count: number;
  file_type: number;
  folder_kind: number | null;
}

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
      source: "live-db",
      dbAvailable: false,
      items: [],
      reason: "Live database not found",
    };
  }

  const db = openLiveDb(dbPath);

  try {
    const { sql, params } = buildSearchQuery(args);
    const rows = db.prepare(sql).all(...params) as unknown as SearchRow[];
    const paths = resolveAbsolutePaths(
      db,
      rows.map((r) => r.file_id),
    );
    const items = rows.map((row) => buildLibraryItem(db, row, paths));

    return { source: "live-db", dbAvailable: true, items };
  } finally {
    db.close();
  }
}

interface QueryPieces {
  sql: string;
  params: Array<string | number>;
}

/**
 * Compose the search SQL and its positional parameters from filter args.
 *
 * @param args - Filter parameters
 * @returns SQL string and parameter array for prepared statement binding
 */
function buildSearchQuery(args: LibrarySearchArgs): QueryPieces {
  const where: string[] = [];
  const params: Array<string | number> = [];

  // Always filter to file_types we know about. Without an explicit `kind`
  // we use the union of all kinds, which excludes internal rows (keyword
  // definitions, vfolder patterns, etc.) the user never wants to see.
  const fileTypeCodes = args.kind
    ? fourCCsForKind(args.kind)
    : allKnownKindFourCCs();

  where.push(`f.file_type IN (${fileTypeCodes.map(() => "?").join(",")})`);
  params.push(...fileTypeCodes);

  if (args.deviceKind) {
    where.push("f.device_type = ?");
    params.push(deviceTypeForKind(args.deviceKind));
  }

  if (args.source) {
    const kinds = folderKindsForSource(args.source);

    where.push(`p.folder_kind IN (${kinds.map(() => "?").join(",")})`);
    params.push(...kinds);
  }

  if (args.query) {
    where.push("f.name LIKE ?");
    params.push(`%${args.query}%`);
  }

  const tagNames = parseTags(args.tags);

  if (tagNames.length > 0) {
    where.push(`(
      SELECT COUNT(DISTINCT kw.name) FROM keywords k
      JOIN files kw ON kw.file_id = k.keyw_id
      WHERE k.file_id = f.file_id AND kw.name IN (${tagNames.map(() => "?").join(",")})
    ) = ?`);
    params.push(...tagNames, tagNames.length);
  }

  const orderBy = orderByClause(args.sort);
  const limit = clampLimit(args.limit);

  params.push(limit);

  const sql = `SELECT f.file_id, f.parent_id, f.name, f.use_count, f.file_type,
                      p.folder_kind AS folder_kind
               FROM files f
               LEFT JOIN places p ON p.file_id = f.place_id
               ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY ${orderBy}
               LIMIT ?`;

  return { sql, params };
}

/**
 * Parse the comma-separated tags string into a trimmed, de-duped list.
 *
 * @param tags - Raw comma-separated string from the caller
 * @returns Array of unique non-empty tag names
 */
function parseTags(tags: string | undefined): string[] {
  if (!tags) {
    return [];
  }

  const parts = tags
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return [...new Set(parts)];
}

/**
 * Map the public sort enum to a SQL ORDER BY clause.
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

  return "f.use_count DESC, f.name ASC";
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

/**
 * Build a public LibraryItem from a raw SearchRow, including path
 * lookup (already resolved in bulk) and per-row tag fetch.
 *
 * @param db - Open database handle
 * @param row - Raw search row
 * @param paths - Map of file_id to absolute path resolved upfront
 * @returns Public LibraryItem with resolved path/kind/source/tags
 */
function buildLibraryItem(
  db: DatabaseSync,
  row: SearchRow,
  paths: Map<number, string>,
): LibraryItem {
  return {
    name: row.name,
    path: paths.get(row.file_id) ?? `/${row.name}`,
    kind: resolveKind(row.file_type),
    tags: fetchTags(db, row.file_id),
    useCount: row.use_count,
    source: row.folder_kind == null ? null : resolveSource(row.folder_kind),
  };
}

/**
 * Fetch all tag names attached to a file via the keywords table.
 *
 * @param db - Open database handle
 * @param fileId - file_id to look up tags for
 * @returns Sorted unique tag names
 */
function fetchTags(db: DatabaseSync, fileId: number): string[] {
  const rows = db
    .prepare(
      `SELECT kw.name AS name
       FROM keywords k
       JOIN files kw ON kw.file_id = k.keyw_id
       WHERE k.file_id = ?
       ORDER BY kw.name`,
    )
    .all(fileId) as unknown as Array<{ name: string }>;

  return rows.map((r) => r.name);
}
