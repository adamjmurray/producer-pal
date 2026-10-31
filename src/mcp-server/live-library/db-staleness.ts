// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Detect a stale snapshot of Live's browser DB.
 *
 * We open `Live-files-*.db` with `mode=ro&immutable=1`, which ignores the WAL
 * sidecar. While Live runs (and after an unclean exit) new installs and samples
 * sit in the `-wal` file, so the immutable read serves the last checkpoint and
 * misses them. A `-wal` newer than the `.db` means that may be happening.
 *
 * Never throws: any stat error is treated as "no detectable risk".
 */

import { stat } from "node:fs/promises";

/** What a caller is told when the DB snapshot may be out of date. */
export const STALENESS_NOTE =
  "Recently installed plug-ins and new samples may be missing until Live restarts. A plug-in can still be loaded by name.";

/**
 * The staleness note for a DB we opened immutably, if its snapshot may be out
 * of date: the `-wal` sidecar exists and is newer than the committed `.db`.
 *
 * @param dbPath - Absolute path to the active `.db` we opened immutably
 * @returns The note, or undefined when there's no detectable staleness
 */
export async function stalenessNote(
  dbPath: string,
): Promise<string | undefined> {
  try {
    const [dbStats, walStats] = await Promise.all([
      stat(dbPath),
      stat(`${dbPath}-wal`),
    ]);

    return walStats.mtimeMs > dbStats.mtimeMs ? STALENESS_NOTE : undefined;
  } catch {
    // A missing `-wal` sidecar (clean exit) lands here; any stat error does.
    return undefined;
  }
}
