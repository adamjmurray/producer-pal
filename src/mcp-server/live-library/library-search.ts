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

// Intentionally lower than the prior ppal-context.search-samples default (100):
// the modern tool returns richer per-item payloads (tags, source, kind), so
// 50 keeps the typical response token-budget-friendly. Callers that want more
// can pass an explicit `limit` up to MAX_LIMIT.
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
      dbAvailable: false,
      items: [],
      reason: "Live database not found",
    };
  }

  const db = openLiveDb(dbPath);

  try {
    const { sql, params } = buildSearchQuery(args);
    const rows = db.prepare(sql).all(...params) as unknown as SearchRow[];
    const fileIds = rows.map((r) => r.file_id);
    const paths = resolveAbsolutePaths(db, fileIds);
    const tagsByFile = fetchTagsBulk(db, fileIds);
    const items = rows.map((row) => buildLibraryItem(row, paths, tagsByFile));

    return { dbAvailable: true, items };
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

    // Defensive: source=sampleFolder has no DB encoding and yields an empty
    // kinds list. The tool caller filters this out, but the route is
    // publicly reachable — emit an impossible predicate to keep the
    // SQL valid (no rows match) rather than producing `IN ()`.
    if (kinds.length === 0) {
      where.push("1 = 0");
    } else {
      where.push(`p.folder_kind IN (${kinds.map(() => "?").join(",")})`);
      params.push(...kinds);
    }
  }

  if (args.query) {
    where.push("f.name LIKE ? ESCAPE '\\'");
    params.push(buildLikePattern(args.query));
  }

  const tagNames = parseTags(args.tags);

  if (tagNames.length > 0) {
    // Match tags case-insensitively (lowercase both sides) so callers
    // can pass "kick" or "KICK" — listTags returns canonical casing
    // but the LLM may not echo it exactly.
    //
    // Unicode caveat: JS `.toLowerCase()` is Unicode-aware, but SQLite's
    // built-in `LOWER()` is ASCII-only (no ICU). A tag like "Café" stored
    // with mixed casing won't match user input that differs only in the
    // accented byte's case. Factory tags are ASCII so this is uncommon;
    // bringing in SQLite's ICU extension would be overkill.
    const lowerTagNames = tagNames.map((t) => t.toLowerCase());

    where.push(`(
      SELECT COUNT(DISTINCT LOWER(kw.name)) FROM keywords k
      JOIN files kw ON kw.file_id = k.keyw_id
      WHERE k.file_id = f.file_id
        AND LOWER(kw.name) IN (${lowerTagNames.map(() => "?").join(",")})
    ) = ?`);
    params.push(...lowerTagNames, lowerTagNames.length);
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
 * Build a SQL LIKE pattern from a user query. Escapes LIKE metacharacters
 * (`%`, `_`, `\`) so filenames containing them match literally, then
 * translates `*` to `%` as the user-facing wildcard. The result is wrapped
 * with implicit `%...%` for substring matching, and the caller must use
 * `ESCAPE '\'` in the LIKE clause.
 *
 * @param query - User-supplied query string
 * @returns LIKE pattern ready to bind as a parameter
 */
function buildLikePattern(query: string): string {
  const escaped = query.replaceAll(/[%\\_]/g, "\\$&");
  const withWildcards = escaped.replaceAll("*", "%");

  return `%${withWildcards}%`;
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

  // Default use_count sort: stable tiebreakers so a fresh user (where most
  // rows have use_count=0) doesn't fall back to whatever the index returns.
  return "f.use_count DESC, f.mod_date DESC, f.name ASC";
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
 * Build a public LibraryItem from a raw SearchRow, with both path and
 * tags pre-resolved in bulk to avoid per-row N+1 queries.
 *
 * @param row - Raw search row
 * @param paths - Map of file_id to absolute path resolved upfront
 * @param tagsByFile - Map of file_id to tag names resolved upfront
 * @returns Public LibraryItem with resolved path/kind/source/tags
 */
function buildLibraryItem(
  row: SearchRow,
  paths: Map<number, string>,
  tagsByFile: Map<number, string[]>,
): LibraryItem {
  return {
    name: row.name,
    path: paths.get(row.file_id) ?? `/${row.name}`,
    kind: resolveKind(row.file_type),
    tags: tagsByFile.get(row.file_id) ?? [],
    useCount: row.use_count,
    source: row.folder_kind == null ? null : resolveSource(row.folder_kind),
  };
}

/**
 * Fetch all tag names for a batch of files in a single query, returned
 * as a Map from file_id to its tag list. Files with no tags are absent
 * from the map (callers should default to []).
 *
 * @param db - Open database handle
 * @param fileIds - file_ids to look up tags for. Empty input returns an empty map.
 * @returns Map from file_id to sorted tag names
 */
function fetchTagsBulk(
  db: DatabaseSync,
  fileIds: number[],
): Map<number, string[]> {
  const result = new Map<number, string[]>();

  if (fileIds.length === 0) {
    return result;
  }

  const placeholders = fileIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT k.file_id AS file_id, kw.name AS name
       FROM keywords k
       JOIN files kw ON kw.file_id = k.keyw_id
       WHERE k.file_id IN (${placeholders})
       ORDER BY k.file_id, kw.name`,
    )
    .all(...fileIds) as unknown as Array<{ file_id: number; name: string }>;

  for (const row of rows) {
    let tags = result.get(row.file_id);

    if (!tags) {
      tags = [];
      result.set(row.file_id, tags);
    }

    tags.push(row.name);
  }

  return result;
}
