// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Rank library samples by audio similarity to a seed sample, using Live's
 * `fe_values` feature vectors (see feature-vectors.ts / the spike).
 *
 * findSimilar is `search` re-ranked by Euclidean distance to the seed instead
 * of by use_count: the same filters (tags, kind, type, source, inFolder)
 * constrain the candidate set, so "find more kicks like this one" is
 * similarTo + tags:Kick. The distance metric, candidate rules, and duplicate
 * collapsing match Live's own View → Show Similar Files list.
 *
 * Read-only: SELECT statements only.
 */

import { type DatabaseSync } from "node:sqlite";
import {
  clampLibraryLimit,
  type FindSimilarArgs,
  type LibraryFindSimilarResult,
  type LibrarySimilarItem,
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
  resolveInFolder,
  type SearchRow,
} from "./candidate-query.ts";
import { decodeFeatureVector, euclideanDistance } from "./feature-vectors.ts";
import { withLiveDb } from "./live-db-query.ts";

/** Default top-K for findSimilar — a focused shortlist, not search's broad 50. */
const DEFAULT_FIND_SIMILAR_LIMIT = 20;

/** Candidate row plus its raw feature-vector BLOB and fingerprint hash. */
type CandidateRow = SearchRow & { data: Uint8Array | null; hash: string };

/** The seed's decoded vector and fingerprint hash. */
interface Seed {
  vector: Float32Array;
  hash: string;
}

/**
 * Find library samples whose audio most resembles the seed at `args.similarTo`.
 *
 * @param args - Seed path (similarTo) plus the search filters constraining candidates
 * @returns Ranked similar items, or why there are none when the seed/DB is unusable
 */
export function findSimilar(
  args: FindSimilarArgs = {},
): Promise<LibraryFindSimilarResult> {
  const seedPath = args.similarTo ?? "";

  return withLiveDb<LibraryFindSimilarResult>({
    onMissing: () => ({
      dbAvailable: false,
      seed: { path: seedPath, found: false },
      items: [],
      detail: "Live database not found",
    }),
    onError: (message) => ({
      dbAvailable: false,
      seed: { path: seedPath, found: false },
      items: [],
      detail: `Failed to read Live database: ${message}`,
    }),
    run: (db, stalenessRisk) =>
      runFindSimilar(db, stalenessRisk, args, seedPath),
  });
}

/**
 * Resolve the seed vector, score the filtered candidates by distance, and return
 * the top-K. Each early return carries a detail so the LLM knows why a query
 * produced no ranked items (missing seed arg, un-indexed seed, un-analyzed
 * seed, or an unresolvable inFolder).
 *
 * @param db - Open database handle
 * @param stalenessRisk - WAL-staleness advisory, if any
 * @param args - Seed path plus candidate filters
 * @param seedPath - The seed path (already defaulted to "")
 * @returns The find-similar result
 */
function runFindSimilar(
  db: DatabaseSync,
  stalenessRisk: StalenessRisk | undefined,
  args: FindSimilarArgs,
  seedPath: string,
): LibraryFindSimilarResult {
  const base = {
    dbAvailable: true as const,
    ...(stalenessRisk && { stalenessRisk }),
  };
  const miss = (found: boolean, detail: string): LibraryFindSimilarResult => ({
    ...base,
    seed: { path: seedPath, found },
    items: [],
    detail,
  });

  if (seedPath === "") {
    return miss(false, "similarTo is required (pass the seed sample's path)");
  }

  // sampleFolder files aren't in Live's fe_values index, so the candidate query
  // can only ever match nothing (buildCandidateWhere emits an impossible
  // predicate). Explain it rather than returning a silent empty set.
  if (args.source === "sample-folder") {
    return miss(
      false,
      "audio similarity uses Live's analyzed library; sample-folder samples aren't indexed there — remove source:sample-folder",
    );
  }

  const seedFileId = resolveFileIdForPath(db, seedPath);

  if (seedFileId == null) {
    return miss(false, "seed not in Live's library (can't fingerprint it)");
  }

  const seed = loadSeed(db, seedFileId);

  if (seed == null) {
    return miss(false, "Live has no audio analysis for this sample");
  }

  const resolved = resolveInFolder(db, args.inFolder);

  if (!resolved.ok) {
    return miss(true, resolved.reason);
  }

  const ranked = rankCandidates(db, args, seed, resolved.parentId);

  return { ...base, seed: { path: seedPath, found: true }, items: ranked };
}

/**
 * Score every filtered candidate against the seed and build the top-K items.
 *
 * Like Live's list, each audio fingerprint appears once (lowest file_id wins)
 * so copies of one sample can't crowd the top. The seed's own copies are
 * skipped.
 *
 * @param db - Open database handle
 * @param args - Candidate filters (plus limit)
 * @param seed - The resolved seed
 * @param parentId - Resolved inFolder parent, or undefined when no inFolder
 * @returns Ranked similar items (nearest first)
 */
function rankCandidates(
  db: DatabaseSync,
  args: FindSimilarArgs,
  seed: Seed,
  parentId: number | undefined,
): LibrarySimilarItem[] {
  const { where, params } = buildCandidateWhere(args, parentId, {
    sourceShowsHidden: false,
  });

  // CAST hash to TEXT: it's a full 64-bit int that a JS number can't hold.
  // Assumes one fe_values row per file; a second row with another hash would
  // list the file twice.
  const sql = `SELECT ${CANDIDATE_COLUMNS}, fv.data AS data,
                      CAST(fv.hash AS TEXT) AS hash
               FROM ${CANDIDATE_FROM}
               JOIN fe_values fv ON fv.file_id = f.file_id
               WHERE ${where.join(" AND ")}
               ORDER BY f.file_id`;
  const rows = db.prepare(sql).all(...params) as unknown as CandidateRow[];
  const seenHashes = new Set([seed.hash]);
  const scored: Array<{ row: SearchRow; distance: number }> = [];

  for (const row of rows) {
    if (seenHashes.has(row.hash)) {
      continue;
    }

    // Skip rows whose format we don't recognize.
    const vector = decodeFeatureVector(row.data);

    if (vector == null) {
      continue;
    }

    seenHashes.add(row.hash);
    scored.push({ row, distance: euclideanDistance(seed.vector, vector) });
  }

  scored.sort((a, b) => a.distance - b.distance);
  const top = scored.slice(
    0,
    clampLibraryLimit(args.limit, DEFAULT_FIND_SIMILAR_LIMIT),
  );
  const fileIds = top.map((s) => s.row.file_id);
  const paths = resolveAbsolutePaths(db, fileIds);
  const tagsByFile = fetchTagsBulk(db, fileIds);

  return top.map((s) => ({
    ...buildLibraryItem(s.row, paths, tagsByFile),
    distance: Math.round(s.distance * 100) / 100,
  }));
}

/**
 * Load and decode the seed's feature vector and hash, or null when the file
 * has no `fe_values` row (Live hasn't analyzed it, and greys out its Find
 * Similar) or the row's format is unknown.
 *
 * @param db - Open database handle
 * @param fileId - The seed's file_id
 * @returns The seed, or null
 */
function loadSeed(db: DatabaseSync, fileId: number): Seed | null {
  const row = db
    .prepare(
      `SELECT data, CAST(hash AS TEXT) AS hash
       FROM fe_values WHERE file_id = ? LIMIT 1`,
    )
    .get(fileId) as { data: Uint8Array | null; hash: string } | undefined;

  if (row == null) {
    return null;
  }

  const vector = decodeFeatureVector(row.data);

  return vector == null ? null : { vector, hash: row.hash };
}
