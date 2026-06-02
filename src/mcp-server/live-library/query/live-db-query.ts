// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Run a read-only operation against Live's browser DB with the standard
 * request guards: locate the DB, measure staleness risk, open it immutably,
 * always close it, and degrade to a caller-shaped result when the DB is
 * missing or a query throws (Live's schema varies across releases).
 *
 * The three result shapes differ per action, so the missing/error fallbacks
 * are supplied as callbacks rather than baked in here.
 */

import { type DatabaseSync } from "node:sqlite";
import { errorMessage } from "#src/shared/error-utils.ts";
import { detectStalenessRisk } from "../db-staleness.ts";
import { type StalenessRisk } from "../library-types.ts";
import { findLiveFilesDbPath } from "../live-db-path.ts";
import { openLiveDb } from "../live-db.ts";

export interface LiveDbHandlers<T> {
  /** Called when no Live DB file is found (Live not installed). */
  onMissing: () => T;
  /** Called when opening or querying the DB throws (schema drift, torn read). */
  onError: (message: string) => T;
  /** The read-only work, given an open handle and the staleness advisory. */
  run: (db: DatabaseSync, stalenessRisk: StalenessRisk | undefined) => T;
}

/**
 * Execute a read-only Live-DB operation behind the shared guards.
 *
 * @param handlers - Missing/error fallbacks plus the run callback
 * @returns The run result, or a fallback when the DB is missing/unreadable
 */
export async function withLiveDb<T>(handlers: LiveDbHandlers<T>): Promise<T> {
  const dbPath = await findLiveFilesDbPath();

  if (!dbPath) {
    return handlers.onMissing();
  }

  // Best-effort advisory: flag a pending WAL from an unclean Live exit that our
  // immutable read can't see. Passed to run; omitted from results when absent.
  const stalenessRisk = await detectStalenessRisk(dbPath);

  try {
    const db = openLiveDb(dbPath);

    try {
      return handlers.run(db, stalenessRisk);
    } finally {
      db.close();
    }
  } catch (error) {
    return handlers.onError(errorMessage(error));
  }
}
