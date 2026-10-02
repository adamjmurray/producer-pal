// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type DatabaseSync } from "node:sqlite";
import { findLiveFilesDbPath } from "../live-db-path.ts";
import { openLiveDb } from "../live-db.ts";
import { resolveAbsolutePaths } from "../reconstruct-path.ts";

/** `places.folder_kind` for the User Library row, verified on a Live 12 DB. */
const USER_LIBRARY_FOLDER_KIND = 1;

/**
 * Find Live's User Library folder by reading its browser database. Never
 * throws: a missing database, an old runtime without `node:sqlite`, or a
 * database with no User Library row all come back null so callers can ask the
 * user for the folder instead.
 *
 * @returns Absolute path to the User Library, or null when it can't be read
 */
export async function findUserLibraryPath(): Promise<string | null> {
  const dbPath = await findLiveFilesDbPath();

  if (dbPath == null) {
    return null;
  }

  let db: DatabaseSync | undefined;

  try {
    db = await openLiveDb(dbPath);

    return userLibraryPathIn(db);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Read the User Library's absolute path out of an open files database.
 *
 * @param db - Open Live files database
 * @returns The absolute path, or null when the row or its parent chain is gone
 */
function userLibraryPathIn(db: DatabaseSync): string | null {
  const row = db
    .prepare("SELECT file_id FROM places WHERE folder_kind = ? LIMIT 1")
    .get(USER_LIBRARY_FOLDER_KIND) as { file_id?: unknown } | undefined;

  if (typeof row?.file_id !== "number") {
    return null;
  }

  return resolveAbsolutePaths(db, [row.file_id]).get(row.file_id)?.path ?? null;
}
