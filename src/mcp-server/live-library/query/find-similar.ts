// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Rank library samples by audio similarity to a seed sample, using Live's
 * `fe_values` feature vectors (see fe-values-helpers.ts / the AJM-331 spike).
 *
 * findSimilar is `search` re-ranked by cosine distance to the seed instead of
 * by use_count: the same filters (tags, kind, type, source, inFolder) constrain
 * the candidate set, so "find more kicks like this one" is similarTo + tags:Kick.
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
  type SearchRow,
} from "./candidate-query.ts";
import {
  cosineSimilarity,
  decodeFeatureVector,
  vectorNorm,
} from "./fe-values-helpers.ts";
import { withLiveDb } from "./live-db-query.ts";

/** Default top-K for findSimilar — a focused shortlist, not search's broad 50. */
const DEFAULT_FIND_SIMILAR_LIMIT = 20;

/** Candidate row plus its raw feature-vector BLOB. */
type CandidateRow = SearchRow & { data: Uint8Array };

/**
 * Find library samples whose audio most resembles the seed at `args.similarTo`.
 *
 * @param args - Seed path (similarTo) plus the search filters constraining candidates
 * @returns Ranked similar items, or a graceful reason when the seed/DB is unusable
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
      reason: "Live database not found",
    }),
    onError: (message) => ({
      dbAvailable: false,
      seed: { path: seedPath, found: false },
      items: [],
      reason: `Failed to read Live database: ${message}`,
    }),
    run: (db, stalenessRisk) =>
      runFindSimilar(db, stalenessRisk, args, seedPath),
  });
}

/**
 * Resolve the seed vector, score the filtered candidates by cosine, and return
 * the top-K. Each early return carries a reason so the LLM knows why a query
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
  const miss = (found: boolean, reason: string): LibraryFindSimilarResult => ({
    ...base,
    seed: { path: seedPath, found },
    items: [],
    reason,
  });

  if (seedPath === "") {
    return miss(false, "similarTo is required (pass the seed sample's path)");
  }

  // sampleFolder files aren't in Live's fe_values index, so the candidate query
  // can only ever match nothing (buildCandidateWhere emits an impossible
  // predicate). Explain it rather than returning a silent empty set.
  if (args.source === "sampleFolder") {
    return miss(
      false,
      "audio similarity uses Live's analyzed library; sampleFolder samples aren't indexed there — remove source:sampleFolder",
    );
  }

  const seedFileId = resolveFileIdForPath(db, seedPath);

  if (seedFileId == null) {
    return miss(false, "seed not in Live's library (can't fingerprint it)");
  }

  const seedVector = loadVector(db, seedFileId);

  if (seedVector == null) {
    return miss(false, "Live hasn't analyzed this sample's audio yet");
  }

  const inFolder =
    args.inFolder != null && args.inFolder !== "" ? args.inFolder : null;
  const parentId = inFolder != null ? resolveFileIdForPath(db, inFolder) : null;

  if (inFolder != null && parentId == null) {
    return miss(true, `inFolder path not found: ${inFolder}`);
  }

  const ranked = rankCandidates(db, args, seedFileId, seedVector, parentId);

  return { ...base, seed: { path: seedPath, found: true }, items: ranked };
}

/**
 * Score every filtered candidate against the seed and build the top-K items.
 *
 * @param db - Open database handle
 * @param args - Candidate filters (plus limit)
 * @param seedFileId - file_id of the seed (excluded from results)
 * @param seedVector - Decoded seed feature vector
 * @param parentId - Resolved inFolder parent, or null when no inFolder
 * @returns Ranked similar items (descending similarity)
 */
function rankCandidates(
  db: DatabaseSync,
  args: FindSimilarArgs,
  seedFileId: number,
  seedVector: Float32Array,
  parentId: number | null,
): LibrarySimilarItem[] {
  const { where, params } = buildCandidateWhere(args, parentId ?? undefined);
  // Assumes one fe_values row per file (the AJM-331 spike found this holds across
  // the library); a file with multiple rows would be scored/ranked once per row.
  // The seed side guards this with LIMIT 1 (see loadVector).
  const sql = `SELECT ${CANDIDATE_COLUMNS}, fv.data AS data
               FROM ${CANDIDATE_FROM}
               JOIN fe_values fv ON fv.file_id = f.file_id
               ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}`;
  const rows = db.prepare(sql).all(...params) as unknown as CandidateRow[];
  const seedNorm = vectorNorm(seedVector);

  const scored: Array<{ row: SearchRow; similarity: number }> = [];

  for (const row of rows) {
    // Exclude the seed itself; skip rows whose format we don't recognize.
    if (row.file_id === seedFileId) continue;
    const vector = decodeFeatureVector(row.data);

    if (vector == null) continue;

    scored.push({
      row,
      similarity: cosineSimilarity(
        seedVector,
        vector,
        seedNorm,
        vectorNorm(vector),
      ),
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  const top = scored.slice(
    0,
    clampLibraryLimit(args.limit, DEFAULT_FIND_SIMILAR_LIMIT),
  );
  const fileIds = top.map((s) => s.row.file_id);
  const paths = resolveAbsolutePaths(db, fileIds);
  const tagsByFile = fetchTagsBulk(db, fileIds);

  return top.map((s) => ({
    ...buildLibraryItem(s.row, paths, tagsByFile),
    similarity: Math.round(s.similarity * 1000) / 1000,
  }));
}

/**
 * Load and decode one file's feature vector, or null when the file has no
 * `fe_values` row (Live hasn't analyzed it) or the row's format is unknown.
 *
 * @param db - Open database handle
 * @param fileId - file_id to load
 * @returns The decoded vector, or null
 */
function loadVector(db: DatabaseSync, fileId: number): Float32Array | null {
  const row = db
    .prepare("SELECT data FROM fe_values WHERE file_id = ? LIMIT 1")
    .get(fileId) as { data: Uint8Array } | undefined;

  return row == null ? null : decodeFeatureVector(row.data);
}
