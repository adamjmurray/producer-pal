// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Detect stale-WAL state for Live's browser DB.
 *
 * We open Live's `Live-files-*.db` with `mode=ro&immutable=1`, which
 * deliberately ignores the WAL sidecar. After a clean Live exit the WAL is
 * checkpointed into the main `.db` and the `-wal`/`-shm` sidecars are removed,
 * so the immutable read serves current data. But after an UNCLEAN exit (crash,
 * force-quit, power loss) the `-wal` persists on disk holding uncommitted
 * writes, and our immutable read silently serves the stale last-checkpoint
 * snapshot with no signal.
 *
 * This module surfaces that risk as a best-effort advisory: stat the `.db` and
 * its `-wal` sidecar and, if the WAL is newer than the committed `.db`, flag
 * that the served snapshot may be stale. It never throws — any stat error is
 * treated as "no detectable risk".
 */

import { stat } from "node:fs/promises";
import { type StalenessRisk } from "./library-types.ts";

/**
 * Inspect a resolved DB path for stale-WAL state.
 *
 * Stats the `.db` and its `<dbPath>-wal` sidecar. When the sidecar exists and
 * is newer than the committed `.db`, the immutable read may be serving a stale
 * snapshot, so we return a `wal-pending` risk payload. Any other outcome (no
 * sidecar, sidecar older-or-equal, or any stat error) returns undefined.
 *
 * @param dbPath - Absolute path to the active `.db` we opened immutably
 * @returns A staleness risk payload, or undefined when there's no detectable risk
 */
export async function detectStalenessRisk(
  dbPath: string,
): Promise<StalenessRisk | undefined> {
  try {
    const [dbStats, walStats] = await Promise.all([
      stat(dbPath),
      stat(`${dbPath}-wal`),
    ]);

    // Older-or-equal WAL means it was already checkpointed (or there are no
    // pending writes newer than the committed snapshot) — no risk.
    if (walStats.mtimeMs <= dbStats.mtimeMs) {
      return undefined;
    }

    return {
      kind: "wal-pending",
      dbMtime: dbStats.mtimeMs,
      walMtime: walStats.mtimeMs,
      walSizeMb: roundMb(walStats.size),
      // ageSeconds = how stale the served data could be: the gap between the
      // committed snapshot (db mtime) and the pending writes (wal mtime).
      ageSeconds: (walStats.mtimeMs - dbStats.mtimeMs) / 1000,
    };
  } catch {
    // Best-effort advisory only: a missing `-wal` sidecar (the clean-exit
    // case) is the common path here, but any stat error is swallowed.
    return undefined;
  }
}

/**
 * Convert a byte count to megabytes, rounded to 2 decimal places.
 *
 * @param bytes - File size in bytes
 * @returns Size in MB (decimal megabytes), rounded to 2 decimals
 */
function roundMb(bytes: number): number {
  return Math.round((bytes / 1_000_000) * 100) / 100;
}
