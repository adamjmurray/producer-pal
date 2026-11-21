// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Packs whose folder on disk isn't named like the pack. Live's browser lists a
 * pack by the name in its library entry, and the remote script finds a file in
 * a pack by that name. A pack installed twice sits in `Name-1`, say, and is
 * still listed as `Name`, so the file's real path never matches a pack.
 *
 * Read-only: SELECT statements only.
 */

import { type DatabaseSync } from "node:sqlite";
import { PACK_FOLDER_KIND } from "../library-filters.ts";
import { pathSegment, resolveAbsolutePaths } from "../reconstruct-path.ts";
import { withLiveDb } from "./live-db-query.ts";

/**
 * A file's path with its pack folder written as the browser names the pack,
 * so the remote script can find the pack by name. Any other path comes back
 * as given.
 *
 * @param path - A file's absolute path, as on disk
 * @returns The path with the pack folder renamed, or `path` when no pack's
 *   folder holds it or the library can't be read
 */
export async function browserNamedPackPath(path: string): Promise<string> {
  return await withLiveDb<string>({
    onMissing: () => path,
    onError: () => path,
    run: (db) => renamePackFolder(db, path),
  });
}

/**
 * @param db - Open database handle
 * @param path - A file's absolute path
 * @returns The path with its pack folder renamed, or `path` unchanged
 */
function renamePackFolder(db: DatabaseSync, path: string): string {
  const rows = db
    .prepare(
      `SELECT p.file_id, p.name FROM places p
       JOIN files f ON f.file_id = p.file_id
       WHERE p.folder_kind = ? AND COALESCE(p.name, '') != ''
         AND p.name != f.name`,
    )
    .all(PACK_FOLDER_KIND) as unknown as Array<{
    file_id: number;
    name: string;
  }>;
  const folders = resolveAbsolutePaths(
    db,
    rows.map((row) => row.file_id),
  );
  const file = path.replaceAll("\\", "/");

  for (const { file_id, name } of rows) {
    const folder = folders.get(file_id);

    if (folder == null || folder.truncated) {
      continue;
    }

    if (file.toLowerCase().startsWith(`${folder.path.toLowerCase()}/`)) {
      const parent = folder.path.slice(0, folder.path.lastIndexOf("/"));

      return `${parent}/${pathSegment(name)}${file.slice(folder.path.length)}`;
    }
  }

  return path;
}
