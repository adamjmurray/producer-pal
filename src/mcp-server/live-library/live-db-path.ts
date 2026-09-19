// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolve the paths to Live's browser SQLite databases.
 *
 * Live keeps every historical schema's DB in its database folder, and each
 * install only refreshes its own. With two majors installed, the
 * highest-numbered files DB can belong to a Live that hasn't run in months, so
 * selection is scoped to the running major when we know it. The leading digits
 * of the DB number are the major (12300 -> 12); the rest tracks the DB format,
 * not the release (12.4 still writes 12300).
 *
 * Plugin DBs carry no version anywhere — they are numbered 1, 2. Each install
 * writes its files DB and its plugins DB within about a second of each other
 * when it exits, so the plugins DB whose mtime is nearest the chosen files DB's
 * is that install's partner. The `-wal`/`-shm` sidecars can't do the pairing:
 * they linger after some exits.
 */

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const FILES_DB_PATTERN = /^Live-files-(\d+)\.db$/;
const PLUGINS_DB_PATTERN = /^Live-plugins-(\d+)\.db$/;

/**
 * Major version of the Live that is running, as reported by V8 with every
 * library route call. Null until a route sets it, and on a version we can't
 * parse — both fall back to picking the highest-numbered DB.
 */
let runningLiveMajor: number | null = null;

/**
 * Record which Live major is running, so DB selection prefers that install's
 * databases over a newer install's stale ones.
 *
 * @param major - Live major version (e.g. 12), or null when unknown
 */
export function setRunningLiveMajor(major: number | null): void {
  runningLiveMajor = major;
}

/**
 * Get the platform-specific Ableton Live Database directory.
 *
 * @returns Absolute path to Live's database directory, or null on
 *   unsupported platforms (Linux). Existence is not checked.
 */
export function liveDatabaseDir(): string | null {
  if (process.platform === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Ableton",
      "Live Database",
    );
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;

    if (!localAppData) {
      return null;
    }

    return join(localAppData, "Ableton", "Live Database");
  }

  return null;
}

interface DbCandidate {
  path: string;
  version: number;
  mtimeMs: number;
}

interface DbListing {
  dir: string;
  entries: string[];
}

/**
 * Find the active `Live-files-*.db` file in Live's database directory.
 *
 * @param liveMajor - Major version of the running Live; defaults to whatever
 *   the last route call reported. When it matches no DB, or is null, the
 *   highest-numbered DB wins as before.
 * @returns Absolute path to the active files DB, or null if none found
 *   or the database directory is missing/unsupported.
 */
export async function findLiveFilesDbPath(
  liveMajor: number | null = runningLiveMajor,
): Promise<string | null> {
  const listing = await readDbDir();

  if (listing == null) {
    return null;
  }

  const filesDb = pickFilesDb(
    await collectCandidates(listing, FILES_DB_PATTERN),
    liveMajor,
  );

  return filesDb?.path ?? null;
}

/**
 * Find the active `Live-plugins-*.db` file in Live's database directory.
 *
 * @param liveMajor - Major version of the running Live; defaults to whatever
 *   the last route call reported. Used to pick the files DB this one is paired
 *   with by mtime; without a files DB, the newest plugins DB wins as before.
 * @returns Absolute path to the active plugins DB, or null if none found.
 */
export async function findLivePluginsDbPath(
  liveMajor: number | null = runningLiveMajor,
): Promise<string | null> {
  const listing = await readDbDir();

  if (listing == null) {
    return null;
  }

  const plugins = await collectCandidates(listing, PLUGINS_DB_PATTERN);
  const filesDb = pickFilesDb(
    await collectCandidates(listing, FILES_DB_PATTERN),
    liveMajor,
  );
  const ranked =
    filesDb == null
      ? plugins.toSorted((a, b) => b.mtimeMs - a.mtimeMs)
      : plugins.toSorted(
          (a, b) =>
            Math.abs(a.mtimeMs - filesDb.mtimeMs) -
            Math.abs(b.mtimeMs - filesDb.mtimeMs),
        );

  return ranked[0]?.path ?? null;
}

/**
 * Pick the files DB belonging to the running Live: the highest-numbered one
 * whose major matches, ties broken by most recent mtime. Falls back silently
 * to the highest-numbered DB overall when nothing matches.
 *
 * @param candidates - Every `Live-files-*.db` found
 * @param liveMajor - Major version of the running Live, or null when unknown
 * @returns The chosen candidate, or null when there are none
 */
function pickFilesDb(
  candidates: DbCandidate[],
  liveMajor: number | null,
): DbCandidate | null {
  const matching = candidates.filter(
    (c) => liveMajor != null && majorOf(c.version) === liveMajor,
  );
  const pool = matching.length > 0 ? matching : candidates;
  const ranked = pool.toSorted((a, b) =>
    a.version === b.version ? b.mtimeMs - a.mtimeMs : b.version - a.version,
  );

  return ranked[0] ?? null;
}

/**
 * Extract the Live major from a DB's schema number. The numbers are 5 digits
 * (12300), with the major in the leading digits.
 *
 * @param version - Schema number from the filename
 * @returns The Live major version it belongs to
 */
function majorOf(version: number): number {
  return Math.floor(version / 1000);
}

/**
 * List Live's database directory once, so a lookup that needs both DB kinds
 * doesn't read it twice.
 *
 * @returns The directory and its entries, or null when it can't be read
 */
async function readDbDir(): Promise<DbListing | null> {
  const dir = liveDatabaseDir();

  if (!dir) {
    return null;
  }

  try {
    return { dir, entries: await readdir(dir) };
  } catch {
    return null;
  }
}

/**
 * Build candidates from the entries matching `pattern`, skipping any whose
 * stat fails.
 *
 * @param listing - Directory and entries from readDbDir
 * @param pattern - Regex with one capture group holding the schema number
 * @returns Candidates in directory order
 */
async function collectCandidates(
  listing: DbListing,
  pattern: RegExp,
): Promise<DbCandidate[]> {
  const candidates: DbCandidate[] = [];

  for (const name of listing.entries) {
    const match = pattern.exec(name);

    if (!match?.[1]) {
      continue;
    }

    const version = Number.parseInt(match[1], 10);
    const fullPath = join(listing.dir, name);

    try {
      const stats = await stat(fullPath);

      candidates.push({ path: fullPath, version, mtimeMs: stats.mtimeMs });
    } catch {
      continue;
    }
  }

  return candidates;
}
