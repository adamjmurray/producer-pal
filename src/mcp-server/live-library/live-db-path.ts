// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolve the path to Live's browser SQLite database.
 *
 * Live keeps every historical schema's DB around in its database folder.
 * The active files DB is the one with the highest schema version (encoded
 * in the filename, e.g. `Live-files-12300.db`); on ties, prefer most-recent
 * mtime. Plugin DBs do not use a monotonic version scheme — pick by mtime.
 */

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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

/**
 * Find the active `Live-files-*.db` file in Live's database directory.
 * Picks the highest schema version, breaking ties by most recent mtime.
 *
 * @returns Absolute path to the active files DB, or null if none found
 *   or the database directory is missing/unsupported.
 */
export async function findLiveFilesDbPath(): Promise<string | null> {
  return await findBestDb(/^Live-files-(\d+)\.db$/, (a, b) =>
    a.version === b.version ? b.mtimeMs - a.mtimeMs : b.version - a.version,
  );
}

/**
 * Find the active `Live-plugins-*.db` file in Live's database directory.
 * Two plugin DBs can coexist (one per Live install); pick by mtime alone
 * since the version-number convention is not monotonic across them.
 *
 * @returns Absolute path to the active plugins DB, or null if none found.
 */
export async function findLivePluginsDbPath(): Promise<string | null> {
  return await findBestDb(
    /^Live-plugins-(\d+)\.db$/,
    (a, b) => b.mtimeMs - a.mtimeMs,
  );
}

/**
 * Scan the Live database directory for files matching `pattern` and pick
 * the best one according to `compare`.
 *
 * @param pattern - Regex with one capture group containing the version
 * @param compare - Comparator returning negative if `a` should rank first
 * @returns Path to the best-matching file, or null
 */
async function findBestDb(
  pattern: RegExp,
  compare: (a: DbCandidate, b: DbCandidate) => number,
): Promise<string | null> {
  const dir = liveDatabaseDir();

  if (!dir) {
    return null;
  }

  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }

  const candidates: DbCandidate[] = [];

  for (const name of entries) {
    const match = pattern.exec(name);

    if (!match?.[1]) {
      continue;
    }

    const version = Number.parseInt(match[1], 10);
    const fullPath = join(dir, name);

    try {
      const stats = await stat(fullPath);

      candidates.push({ path: fullPath, version, mtimeMs: stats.mtimeMs });
    } catch {
      continue;
    }
  }

  candidates.sort(compare);

  const best = candidates[0];

  return best ? best.path : null;
}
