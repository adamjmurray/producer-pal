// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Surface near-duplicate samples in Live's library by grouping `fe_values`
 * rows that share an audio fingerprint hash. Per the AJM-331 spike the hash is
 * a deterministic function of the feature vector (same hash ⟺ byte-identical
 * vector ⟺ effectively identical audio), so a `GROUP BY hash` is a free
 * content-dedup detector ("you have this kick 4×").
 *
 * The same search filters scope which files are checked. This is exact-content
 * dedup; fuzzy "sounds alike" is findSimilar's job.
 *
 * Read-only: SELECT statements only.
 */

import { type DatabaseSync } from "node:sqlite";
import {
  clampLibraryLimit,
  type FindDuplicatesArgs,
  type LibraryDuplicateGroup,
  type LibraryFindDuplicatesResult,
  type StalenessRisk,
} from "../library-types.ts";
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
import { decodeFeatureVector } from "./fe-values-helpers.ts";
import { withLiveDb } from "./live-db-query.ts";

/** Default cap on duplicate groups returned (most-duplicated first). */
const DEFAULT_FIND_DUPLICATES_LIMIT = 50;

/** Candidate row plus its feature-vector BLOB and stringified fingerprint. */
type DuplicateRow = SearchRow & { data: Uint8Array; hash: string };

/**
 * Find groups of library files that share an audio fingerprint.
 *
 * @param args - Search filters scoping which files are checked
 * @returns Duplicate groups (most-duplicated first), or a graceful reason
 */
export function findDuplicates(
  args: FindDuplicatesArgs = {},
): Promise<LibraryFindDuplicatesResult> {
  return withLiveDb<LibraryFindDuplicatesResult>({
    onMissing: () => ({
      dbAvailable: false,
      groups: [],
      reason: "Live database not found",
    }),
    onError: (message) => ({
      dbAvailable: false,
      groups: [],
      reason: `Failed to read Live database: ${message}`,
    }),
    run: (db, stalenessRisk) => runFindDuplicates(db, stalenessRisk, args),
  });
}

/**
 * Group the filtered candidates by fingerprint hash and build items for the
 * top groups.
 *
 * @param db - Open database handle
 * @param stalenessRisk - WAL-staleness advisory, if any
 * @param args - Candidate filters (plus limit)
 * @returns The find-duplicates result
 */
function runFindDuplicates(
  db: DatabaseSync,
  stalenessRisk: StalenessRisk | undefined,
  args: FindDuplicatesArgs,
): LibraryFindDuplicatesResult {
  const base = {
    dbAvailable: true as const,
    ...(stalenessRisk && { stalenessRisk }),
  };

  const inFolder =
    args.inFolder != null && args.inFolder !== "" ? args.inFolder : null;
  const parentId = inFolder != null ? resolveFileIdForPath(db, inFolder) : null;

  if (inFolder != null && parentId == null) {
    return {
      ...base,
      groups: [],
      reason: `inFolder path not found: ${inFolder}`,
    };
  }

  const { where, params } = buildCandidateWhere(args, parentId ?? undefined);
  // CAST hash to TEXT so SQLite renders the full 64-bit integer; reading it as a
  // JS number would lose precision past 2^53 and could falsely merge or split
  // groups. The hash is an opaque equality key — never used for arithmetic.
  const sql = `SELECT ${CANDIDATE_COLUMNS}, fv.data AS data,
                      CAST(fv.hash AS TEXT) AS hash
               FROM ${CANDIDATE_FROM}
               JOIN fe_values fv ON fv.file_id = f.file_id
               ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}`;
  const rows = db.prepare(sql).all(...params) as unknown as DuplicateRow[];

  const dupGroups = groupByHash(rows);
  const limit = clampLibraryLimit(args.limit, DEFAULT_FIND_DUPLICATES_LIMIT);
  const capped = dupGroups.slice(0, limit);
  const fileIds = capped.flatMap((g) => g.map((r) => r.file_id));
  const paths = resolveAbsolutePaths(db, fileIds);
  const tagsByFile = fetchTagsBulk(db, fileIds);

  const groups: LibraryDuplicateGroup[] = capped.map((rowsInGroup) => ({
    count: rowsInGroup.length,
    items: rowsInGroup.map((r) => buildLibraryItem(r, paths, tagsByFile)),
  }));

  return { ...base, groups };
}

/**
 * Bucket decodable rows by fingerprint hash and keep only the buckets with
 * more than one member, sorted most-duplicated first. Rows whose BLOB format
 * we don't recognize are skipped (version insurance, consistent with
 * findSimilar) so an unknown future format can't form a bogus group.
 *
 * @param rows - Candidate rows carrying data + hash
 * @returns Duplicate groups (each ≥ 2 rows), descending by size
 */
function groupByHash(rows: DuplicateRow[]): DuplicateRow[][] {
  const byHash = new Map<string, DuplicateRow[]>();

  for (const row of rows) {
    if (decodeFeatureVector(row.data) == null) continue;
    const group = byHash.get(row.hash);

    if (group) group.push(row);
    else byHash.set(row.hash, [row]);
  }

  return [...byHash.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length);
}
