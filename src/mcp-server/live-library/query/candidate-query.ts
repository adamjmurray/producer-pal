// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared candidate querying against Live's browser DB.
 *
 * The structured filter set (name, tags, kind, type, deviceKind, source,
 * inFolder) resolves to one WHERE clause that three actions reuse: `search`
 * (orders + limits the candidates), `findSimilar` (scores them by audio
 * similarity), and `findDuplicates` (groups them by fingerprint hash). Keeping
 * the WHERE builder and the row→LibraryItem conversion here is what lets those
 * actions share a single, tested filter contract instead of duplicating ~100
 * lines of SQL assembly.
 *
 * Read-only: SELECT statements only. Never write SQL, never ATTACH.
 */

import { type DatabaseSync } from "node:sqlite";
import {
  ALC_FILE_TYPE,
  ALC_MIDI_SUBTYPE,
  allKnownKindFourCCs,
  deriveItemType,
  deviceTypeForKind,
  folderKindsForSource,
  fourCCsForKind,
  keywordsForType,
  resolveClipSubtype,
  resolveKind,
  resolveSource,
} from "../library-filters.ts";
import { type LibraryItem, type LibrarySearchArgs } from "../library-types.ts";
import { type ResolvedPath } from "../reconstruct-path.ts";

/** Raw row shape selected by CANDIDATE_COLUMNS. */
export interface SearchRow {
  file_id: number;
  parent_id: number;
  name: string;
  use_count: number;
  file_type: number;
  subtype: number | null;
  folder_kind: number | null;
}

/** Column list every candidate SELECT shares, matching SearchRow. */
export const CANDIDATE_COLUMNS = `f.file_id, f.parent_id, f.name, f.use_count,
  f.file_type, f.subtype, p.folder_kind AS folder_kind`;

/** FROM clause every candidate SELECT shares (places join supplies source). */
export const CANDIDATE_FROM = `files f
  LEFT JOIN places p ON p.file_id = f.place_id`;

/** A WHERE clause as accumulated conditions plus their positional params. */
export interface CandidateWhere {
  where: string[];
  params: Array<string | number>;
}

/**
 * Compose the candidate WHERE conditions and positional params from filter
 * args. The caller joins `where` with " AND " (prefixing "WHERE " when
 * non-empty) and appends its own ORDER BY / LIMIT / scoring.
 *
 * @param args - Filter parameters
 * @param parentId - Resolved file_id for the inFolder constraint, when present
 * @returns Conditions and params (no ORDER BY, no LIMIT)
 */
export function buildCandidateWhere(
  args: LibrarySearchArgs,
  parentId?: number,
): CandidateWhere {
  const where: string[] = [];
  const params: Array<string | number> = [];

  // Always filter to file_types we know about. Without an explicit `kind`
  // we use the union of all kinds, which excludes internal rows (keyword
  // definitions, vfolder patterns, etc.) the user never wants to see.
  const fileTypeCodes = args.kind
    ? fourCCsForKind(args.kind)
    : allKnownKindFourCCs();

  if (args.kind === "midi") {
    // Enrich kind:midi to also surface MIDI Live clips (.alc with the
    // alcM subtype), not just .mid files — the natural "find MIDI ideas" query
    // otherwise misses the bulk of a user's MIDI content. kind:audio is left
    // untouched: it's the loadable-sample bucket, and audio Live clips aren't
    // samples.
    where.push(
      `(f.file_type IN (${fileTypeCodes.map(() => "?").join(",")})
        OR (f.file_type = ? AND f.subtype = ?))`,
    );
    params.push(...fileTypeCodes, ALC_FILE_TYPE, ALC_MIDI_SUBTYPE);
  } else {
    where.push(`f.file_type IN (${fileTypeCodes.map(() => "?").join(",")})`);
    params.push(...fileTypeCodes);
  }

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

  if (args.type) {
    // Playback-type filter: match files carrying any of the type's Live
    // keywords. EXISTS (OR over names) rather than the AND-all tags subquery
    // below, since "loop" covers both "Loop" and "Looping".
    const typeNames = keywordsForType(args.type);

    where.push(`EXISTS (
      SELECT 1 FROM keywords kt
      JOIN files kwt ON kwt.file_id = kt.keyw_id
      WHERE kt.file_id = f.file_id
        AND kwt.name IN (${typeNames.map(() => "?").join(",")})
    )`);
    params.push(...typeNames);
  }

  const tagNames = parseTags(args.tags);

  if (tagNames.length > 0) {
    // Match tags case-insensitively (lowercase both sides) so callers
    // can pass "kick" or "KICK" — listTags returns canonical casing
    // but the LLM may not echo it exactly. Dedupe AFTER lowercasing so
    // mixed-case duplicates (e.g. "Kick,kick") collapse to one tag and the
    // HAVING count matches; deduping before would require COUNT=2 against a
    // single distinct lowercase tag and return false empty results.
    //
    // Unicode caveat: JS `.toLowerCase()` is Unicode-aware, but SQLite's
    // built-in `LOWER()` is ASCII-only (no ICU). A tag like "Café" stored
    // with mixed casing won't match user input that differs only in the
    // accented byte's case. Factory tags are ASCII so this is uncommon;
    // bringing in SQLite's ICU extension would be overkill.
    const lowerTagNames = [...new Set(tagNames.map((t) => t.toLowerCase()))];

    where.push(`(
      SELECT COUNT(DISTINCT LOWER(kw.name)) FROM keywords k
      JOIN files kw ON kw.file_id = k.keyw_id
      WHERE k.file_id = f.file_id
        AND LOWER(kw.name) IN (${lowerTagNames.map(() => "?").join(",")})
    ) = ?`);
    params.push(...lowerTagNames, lowerTagNames.length);
  }

  return { where, params };
}

/**
 * Resolve an absolute path to the file_id of the matching row by walking the
 * path segments through the files-table hierarchy. Works for both folder paths
 * (used by inFolder) and file paths (used by the findSimilar seed). Returns
 * null when any segment is not found.
 *
 * Path normalization: leading and trailing slashes are stripped before
 * splitting so "/Users/Ableton/" and "/Users/Ableton" resolve identically.
 *
 * Algorithm: start from the root row (parent_id = 0, name = "/" or a Windows
 * drive letter like "C:"), then walk each path segment as a child lookup.
 *
 * Case sensitivity: segment lookups use `COLLATE NOCASE` so an LLM passing
 * "/users/..." on a case-insensitive macOS/Windows FS still resolves the
 * same row as "/Users/...". The ASCII-only restriction of SQLite's NOCASE
 * collation is fine here — Live's library paths are ASCII in practice.
 *
 * @param db - Open database handle
 * @param absolutePath - Absolute path to resolve, with or without trailing slash
 * @returns file_id of the matching row, or null if unresolvable
 */
export function resolveFileIdForPath(
  db: DatabaseSync,
  absolutePath: string,
): number | null {
  const normalized = absolutePath.endsWith("/")
    ? absolutePath.slice(0, -1)
    : absolutePath;

  // Split into segments. For a POSIX path "/Users/Ableton/User Library":
  //   split("/") → ["", "Users", "Ableton", "User Library"]
  // The empty first element corresponds to the root row ("/").
  const segments = normalized.split("/");

  // Find the root row — parent_id = 0, matching the first segment.
  // POSIX root is stored as "/"; Windows drive root as "C:" (or "C:\").
  const rootName = segments[0] === "" ? "/" : (segments[0] as string);

  // The reconstructed path always renders a drive root as "C:" (no trailing
  // slash), but Live may have stored it as "C:\". Match either form so a
  // "C:\"-rooted DB still resolves. For a non-drive root the alt equals the
  // primary, so this is a no-op there.
  const rootAlt = /^[A-Za-z]:$/.test(rootName) ? `${rootName}\\` : rootName;
  const rootRow = db
    .prepare(
      "SELECT file_id FROM files WHERE parent_id = 0 AND (name = ? COLLATE NOCASE OR name = ? COLLATE NOCASE) LIMIT 1",
    )
    .get(rootName, rootAlt) as { file_id: number } | undefined;

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
        "SELECT file_id FROM files WHERE parent_id = ? AND name = ? COLLATE NOCASE LIMIT 1",
      )
      .get(currentId, seg) as { file_id: number } | undefined;

    if (!row) {
      return null;
    }

    currentId = row.file_id;
  }

  return currentId;
}

export type InFolderResolution =
  { ok: true; parentId: number | undefined } | { ok: false; reason: string };

/**
 * Normalize an optional `inFolder` filter (treating "" as absent) and resolve
 * it to a parent file_id. Returns `ok: false` with a ready-to-surface reason
 * when a non-empty inFolder doesn't resolve to a known folder, otherwise
 * `ok: true` with `parentId` (undefined when no inFolder was given — the shape
 * buildCandidateWhere expects). Shared by find-duplicates and find-similar so
 * the empty-string handling and not-found message stay identical.
 *
 * @param db - Open database handle
 * @param inFolderArg - The caller's raw inFolder argument
 * @returns Resolution result discriminated on `ok`
 */
export function resolveInFolder(
  db: DatabaseSync,
  inFolderArg: string | null | undefined,
): InFolderResolution {
  const inFolder =
    inFolderArg != null && inFolderArg !== "" ? inFolderArg : null;
  const parentId = inFolder != null ? resolveFileIdForPath(db, inFolder) : null;

  if (inFolder != null && parentId == null) {
    return { ok: false, reason: `inFolder path not found: ${inFolder}` };
  }

  return { ok: true, parentId: parentId ?? undefined };
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
export function buildLibraryItem(
  row: SearchRow,
  paths: Map<number, ResolvedPath>,
  tagsByFile: Map<number, string[]>,
): LibraryItem {
  const resolved = paths.get(row.file_id);
  const tags = tagsByFile.get(row.file_id) ?? [];
  const item: LibraryItem = {
    name: row.name,
    path: resolved?.path ?? `/${row.name}`,
    kind: resolveKind(row.file_type),
    tags,
    useCount: row.use_count,
    source: row.folder_kind == null ? null : resolveSource(row.folder_kind),
  };

  const subtype = resolveClipSubtype(row.file_type, row.subtype);

  if (subtype != null) {
    item.subtype = subtype;
  }

  const type = deriveItemType(tags);

  if (type != null) {
    item.type = type;
  }

  if (resolved?.folder != null) {
    item.folder = resolved.folder;
  }

  if (resolved?.truncated) {
    item.pathTruncated = true;
  }

  return item;
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
export function fetchTagsBulk(
  db: DatabaseSync,
  fileIds: number[],
): Map<number, string[]> {
  const result = new Map<number, string[]>();

  if (fileIds.length === 0) {
    return result;
  }

  const placeholders = fileIds.map(() => "?").join(",");
  // The SELECT column list is trusted to match the destructure below — the SQL
  // is hand-written and pinned by tests, so a per-row validator would be dead
  // weight at the limit=1000 sizes the library tools issue.
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
