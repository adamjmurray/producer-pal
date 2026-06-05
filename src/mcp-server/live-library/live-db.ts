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
 *
 * `node:sqlite` is resolved via a dynamic import (see {@link openLiveDb}), NOT
 * a static top-level import. It shipped flag-free only in Node 22.13; older
 * Node-for-Max runtimes (an older or standalone Max) don't expose it. A static
 * import would fail at module-link time and crash the entire MCP server on
 * load — blocking the user from connecting to Ableton at all. Loading it
 * lazily keeps the failure inside the library code paths: the route guard
 * ({@link ensureSqliteAvailable}) checks it up front and throws
 * {@link SqliteUnavailableError}, surfacing as a hard tool error the chat UI
 * flags and the LLM sees, while connecting and every other tool keep working.
 */

import { type DatabaseSync } from "node:sqlite";

/**
 * Guidance surfaced to the LLM when the host runtime lacks `node:sqlite`.
 * Live 12.4 is the first release whose bundled Max ships a Node-for-Max new
 * enough (Node 22.13+) to provide it. User-facing, so it avoids runtime jargon
 * and reads naturally after each route's `Failed to read Live database:` prefix.
 */
export const SQLITE_UNAVAILABLE_MESSAGE =
  "you must be running Ableton Live 12.4 or later to use this feature. If you " +
  "are using standalone Max instead of the Max bundled with Live, make sure " +
  "Max is up to date.";

/**
 * Thrown when the host runtime doesn't provide `node:sqlite` (a Max older than
 * the one bundled with Live 12.4). A distinct type so the route registration
 * guard ({@link ensureSqliteAvailable}) lets it propagate as a hard tool error,
 * rather than the soft `dbAvailable: false` degrade the routes use for a
 * missing DB or schema drift.
 */
export class SqliteUnavailableError extends Error {}

/**
 * Open a Live database file read-only with immutable=1.
 *
 * @param dbPath - Absolute filesystem path to the SQLite database
 * @returns A read-only DatabaseSync handle. Caller is responsible for `.close()`.
 * @throws If `node:sqlite` is unavailable on this runtime, or the file cannot
 *   be opened
 */
export async function openLiveDb(dbPath: string): Promise<DatabaseSync> {
  const open = await loadOpener();

  // SQLite URI format requires the `file:` scheme and percent-encoded path.
  // Backslashes (Windows) and `?`/`#` in the path itself must be encoded so
  // they aren't parsed as URI delimiters.
  const uri = `file:${encodePathForSqliteUri(dbPath)}?mode=ro&immutable=1`;

  return open(uri);
}

/**
 * Confirm the runtime provides `node:sqlite`, throwing
 * {@link SqliteUnavailableError} if not. Called up front by the library route
 * guard (before any DB work) so an unsupported runtime surfaces as a hard tool
 * error instead of being swallowed by a route's schema-drift degrade guard.
 *
 * @throws {SqliteUnavailableError} when `node:sqlite` is unavailable
 */
export async function ensureSqliteAvailable(): Promise<void> {
  await loadOpener();
}

let openerPromise: Promise<(uri: string) => DatabaseSync> | undefined;

/**
 * Lazily load `node:sqlite` and resolve to a `DatabaseSync` factory, caching
 * the in-flight/settled promise so the import happens at most once.
 *
 * The import is dynamic (not a static top-level `import`) so a runtime without
 * `node:sqlite` fails here — at call time, inside the library code paths —
 * rather than at module-link time, which would crash the whole MCP server on
 * load.
 *
 * @returns A promise resolving to a function that opens a DB at the given URI
 * @throws {SqliteUnavailableError} With {@link SQLITE_UNAVAILABLE_MESSAGE} when
 *   the runtime does not provide `node:sqlite`
 */
function loadOpener(): Promise<(uri: string) => DatabaseSync> {
  openerPromise ??= import("node:sqlite").then(
    ({ DatabaseSync }) =>
      (uri: string) =>
        new DatabaseSync(uri),
    (error) => {
      throw new SqliteUnavailableError(SQLITE_UNAVAILABLE_MESSAGE, {
        cause: error,
      });
    },
  );

  return openerPromise;
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
