// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Open Live's browser SQLite database read-only.
 *
 * Strategy: `mode=ro&immutable=1` URI. `immutable=1` is essential because
 * Live's DBs are in WAL journal mode — opening read-only without immutable
 * fails when Live is not running (no `-wal`/`-shm` sidecars to read), and
 * is risky when Live is running (write contention). `immutable=1` skips
 * locking and journaling setup, so we cannot perturb anything Live is doing.
 *
 * Tradeoff: under `immutable=1`, our reads may see torn pages if Live
 * writes during the query. Live writes are infrequent enough that this is
 * acceptable for read-only library queries the user can re-issue.
 *
 * Hard rules: SELECT-only, no `ATTACH … AS rw`, no write SQL ever.
 */

import { DatabaseSync } from "node:sqlite";

/**
 * Open a Live database file read-only with immutable=1.
 *
 * @param dbPath - Absolute filesystem path to the SQLite database
 * @returns A read-only DatabaseSync handle. Caller is responsible for `.close()`.
 * @throws If the file does not exist or cannot be opened
 */
export function openLiveDb(dbPath: string): DatabaseSync {
  // SQLite URI format requires the `file:` scheme and percent-encoded path.
  // Backslashes (Windows) and `?`/`#` in the path itself must be encoded so
  // they aren't parsed as URI delimiters.
  const uri = `file:${encodePathForSqliteUri(dbPath)}?mode=ro&immutable=1`;

  return new DatabaseSync(uri);
}

/**
 * Encode a filesystem path for use as the body of an SQLite URI.
 *
 * SQLite URI parsing reserves `?` and `#` as query/fragment delimiters,
 * and `%` as the percent-encoding indicator (so a folder named "100%"
 * would be misinterpreted unless we escape it).
 *
 * Windows paths come in with backslashes (e.g. `C:\Users\Name\db.db`),
 * but SQLite's URI parser only understands forward slashes. We convert
 * `\` → `/` and ensure a leading "/" so the URI becomes
 * `file:/C:/Users/Name/db.db` rather than `file:C:\...`.
 *
 * Exported for unit testing — the Windows case cannot be exercised
 * end-to-end on macOS/Linux CI.
 *
 * @param path - Raw filesystem path
 * @returns Encoded path safe to embed in `file:<path>?...`
 */
export function encodePathForSqliteUri(path: string): string {
  const forwardSlashes = path.replaceAll("\\", "/");
  const rooted = forwardSlashes.startsWith("/")
    ? forwardSlashes
    : `/${forwardSlashes}`;

  return rooted
    .replaceAll("%", "%25")
    .replaceAll("?", "%3F")
    .replaceAll("#", "%23");
}
