// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * DB-backed sample search against Live's browser SQLite database.
 *
 * Reads `Live-files-*.db` (read-only, immutable=1), filters `files` by
 * audio file_kind bits (4 = AIFF/WAV, 2048 = compressed audio) and an
 * optional name LIKE pattern, and reconstructs each result's absolute
 * filesystem path by walking parent_id up to the root.
 *
 * Read-only: SELECT statements only. Never write SQL, never ATTACH.
 */

import { findLiveFilesDbPath } from "./live-db-path.ts";
import { openLiveDb } from "./live-db.ts";
import { resolveAbsolutePaths } from "./reconstruct-path.ts";

export interface SampleSearchArgs {
  query?: string;
  limit?: number;
}

export interface SampleResult {
  /** Absolute filesystem path */
  path: string;
  /** Filename only */
  name: string;
  /** Live's persistent usage counter (real ranking signal) */
  useCount: number;
}

export interface SampleSearchResult {
  source: "live-db";
  /** True when the Live DB was found and queried */
  dbAvailable: boolean;
  samples: SampleResult[];
  /** Present when dbAvailable is false */
  reason?: string;
}

/** Default cap on number of results returned */
const DEFAULT_LIMIT = 100;
/** Hard cap to bound memory and walk cost */
const MAX_LIMIT = 1_000;

/** Audio file_kind bits per the spike report */
const FILE_KIND_AUDIO_UNCOMPRESSED = 4;
const FILE_KIND_AUDIO_COMPRESSED = 2048;

interface FileRow {
  file_id: number;
  parent_id: number;
  name: string;
  use_count: number;
}

/**
 * Search Live's browser DB for audio samples by name substring.
 *
 * @param args - Search parameters
 * @returns Search result. `dbAvailable: false` when Live's DB is missing
 *   (e.g. Live not installed, brand-new user) — caller should fall back
 *   to other sample sources.
 */
export async function searchSamples(
  args: SampleSearchArgs = {},
): Promise<SampleSearchResult> {
  const dbPath = await findLiveFilesDbPath();

  if (!dbPath) {
    return {
      source: "live-db",
      dbAvailable: false,
      samples: [],
      reason: "Live database not found",
    };
  }

  const limit = clampLimit(args.limit);
  const db = openLiveDb(dbPath);

  try {
    const rows = db
      .prepare(
        `SELECT file_id, parent_id, name, use_count
         FROM files
         WHERE ((file_kind & ${FILE_KIND_AUDIO_UNCOMPRESSED}) != 0
                OR (file_kind & ${FILE_KIND_AUDIO_COMPRESSED}) != 0)
         ${args.query ? "AND name LIKE ?" : ""}
         ORDER BY use_count DESC, name ASC
         LIMIT ?`,
      )
      .all(...buildParams(args.query, limit)) as unknown as FileRow[];
    const paths = resolveAbsolutePaths(
      db,
      rows.map((r) => r.file_id),
    );
    const samples = rows.map((row) => ({
      path: paths.get(row.file_id) ?? `/${row.name}`,
      name: row.name,
      useCount: row.use_count,
    }));

    return { source: "live-db", dbAvailable: true, samples };
  } finally {
    db.close();
  }
}

/**
 * Clamp the requested limit to safe bounds.
 *
 * @param requested - User-supplied limit
 * @returns Clamped limit between 1 and MAX_LIMIT
 */
function clampLimit(requested: number | undefined): number {
  if (requested == null || !Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(requested), MAX_LIMIT);
}

/**
 * Build the parameter array for the search prepared statement.
 *
 * @param query - Optional name substring
 * @param limit - Result limit
 * @returns Positional parameters in declaration order
 */
function buildParams(
  query: string | undefined,
  limit: number,
): Array<string | number> {
  return query ? [`%${query}%`, limit] : [limit];
}
