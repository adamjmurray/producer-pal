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
  clampLibraryLimit,
  DEFAULT_LIBRARY_LIMIT,
  type LibraryItem,
  type LibrarySearchArgs,
  type LibrarySearchResult,
} from "./library-types.ts";
import { findLiveFilesDbPath } from "./live-db-path.ts";
import { openLiveDb } from "./live-db.ts";
import { resolveAbsolutePaths, type ResolvedPath } from "./reconstruct-path.ts";

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
    const resolvedParent =
      args.inFolder != null ? resolveParentId(db, args.inFolder) : undefined;

    // inFolder was provided but the path doesn't map to any known folder
    if (args.inFolder != null && resolvedParent == null) {
      return { dbAvailable: true, items: [] };
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
 * @param parentId - Resolved file_id for the inFolder constraint, when present
 * @returns SQL string and parameter array for prepared statement binding
 */
function buildSearchQuery(
  args: LibrarySearchArgs,
  parentId?: number,
): QueryPieces {
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

  if (parentId != null) {
    where.push("f.parent_id = ?");
    params.push(parentId);
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
  const limit = clampLibraryLimit(args.limit, DEFAULT_LIBRARY_LIMIT);

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

/**
 * Build a public LibraryItem from a raw SearchRow, with both path and
 * tags pre-resolved in bulk to avoid per-row N+1 queries.
 *
 * @param row - Raw search row
 * @param paths - Map of file_id to resolved path resolved upfront
 * @param tagsByFile - Map of file_id to tag names resolved upfront
 * @returns Public LibraryItem with resolved path/kind/source/tags
 */
function buildLibraryItem(
  row: SearchRow,
  paths: Map<number, ResolvedPath>,
  tagsByFile: Map<number, string[]>,
): LibraryItem {
  const resolved = paths.get(row.file_id);
  const item: LibraryItem = {
    name: row.name,
    path: resolved?.path ?? `/${row.name}`,
    kind: resolveKind(row.file_type),
    tags: tagsByFile.get(row.file_id) ?? [],
    useCount: row.use_count,
    source: row.folder_kind == null ? null : resolveSource(row.folder_kind),
  };

  if (resolved?.folder != null) {
    item.folder = resolved.folder;
  }

  if (resolved?.truncated) {
    item.pathTruncated = true;
  }

  return item;
}

/**
 * Resolve an absolute folder path to the file_id of the matching folder row
 * by walking the path segments through the files table hierarchy. Returns
 * null when any segment in the path is not found.
 *
 * Path normalization: leading and trailing slashes are stripped before
 * splitting so "/Users/Ableton/" and "/Users/Ableton" resolve identically.
 *
 * Algorithm: start from the root row (parent_id = 0, name = "/" or a Windows
 * drive letter like "C:"), then walk each path segment as a child lookup.
 *
 * @param db - Open database handle
 * @param folderPath - Absolute path to resolve, with or without trailing slash
 * @returns file_id of the folder, or null if unresolvable
 */
function resolveParentId(db: DatabaseSync, folderPath: string): number | null {
  const normalized = folderPath.endsWith("/")
    ? folderPath.slice(0, -1)
    : folderPath;

  // Split into segments. For a POSIX path "/Users/Ableton/User Library":
  //   split("/") → ["", "Users", "Ableton", "User Library"]
  // The empty first element corresponds to the root row ("/").
  const segments = normalized.split("/");

  // Find the root row — parent_id = 0, matching the first segment.
  // POSIX root is stored as "/"; Windows drive root as "C:" (or "C:\").
  const rootName = segments[0] === "" ? "/" : (segments[0] as string);
  const rootRow = db
    .prepare(
      "SELECT file_id FROM files WHERE parent_id = 0 AND name = ? LIMIT 1",
    )
    .get(rootName) as { file_id: number } | undefined;

  if (!rootRow) {
    return null;
  }

  // Walk remaining segments down the hierarchy, skipping the root element
  // (the empty string for POSIX "/..." paths, or the drive letter for Windows).
  const childSegments = segments.slice(1);
  let currentId = rootRow.file_id;

  for (const seg of childSegments) {
    if (seg === "") continue;
    const row = db
      .prepare(
        "SELECT file_id FROM files WHERE parent_id = ? AND name = ? LIMIT 1",
      )
      .get(currentId, seg) as { file_id: number } | undefined;

    if (!row) {
      return null;
    }

    currentId = row.file_id;
  }

  return currentId;
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
  // Same SELECT-column trust as the main query — see comment in librarySearch.
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
