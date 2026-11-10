// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Map file paths to Live's DB file_ids, so a search can leave those files out
 * (the sample-folder scan and the DB list some of the same files). Paths are
 * matched case-insensitively, as the DB records them as written at index time.
 *
 * Read-only: SELECT statements only. The ids go back to V8 rather than the
 * paths going into the search because a V8-to-Node message is capped at about
 * 30KB, which a long path list overflows.
 */

import { type DatabaseSync } from "node:sqlite";
import {
  type ResolveFileIdsArgs,
  type ResolveFileIdsResult,
} from "../library-types.ts";
import { pathSegment } from "../reconstruct-path.ts";
import { resolveFileIdForPath } from "./candidate-query.ts";
import { withLiveDb } from "./live-db-query.ts";

/**
 * Resolve paths to the file_ids the DB lists them under.
 *
 * @param args - The absolute paths to resolve
 * @returns The ids found; a path the DB doesn't list adds none
 */
export function resolveFileIds(
  args: ResolveFileIdsArgs = {},
): Promise<ResolveFileIdsResult> {
  const paths = args.paths ?? [];

  return withLiveDb<ResolveFileIdsResult>({
    onMissing: () => ({ fileIds: [] }),
    onError: () => ({ fileIds: [] }),
    run: (db) => ({ fileIds: paths.length > 0 ? lookUp(db, paths) : [] }),
  });
}

/**
 * Find each path's file_id: resolve each distinct folder once, then read those
 * folders' children in one query and match their names.
 *
 * @param db - Open database handle
 * @param paths - Absolute file paths
 * @returns The matching file_ids
 */
function lookUp(db: DatabaseSync, paths: string[]): number[] {
  // A folder's id, mapped to the file names wanted from it.
  const wanted = new Map<number, Set<string>>();
  const folderIds = new Map<string, number | null>();

  for (const path of paths) {
    const slash = path.lastIndexOf("/");

    if (slash < 0) {
      continue;
    }

    const folder = path.slice(0, slash);

    if (!folderIds.has(folder)) {
      folderIds.set(folder, resolveFileIdForPath(db, folder));
    }

    const folderId = folderIds.get(folder);

    if (folderId != null) {
      const names = wanted.get(folderId) ?? new Set<string>();

      names.add(comparable(path.slice(slash + 1)));
      wanted.set(folderId, names);
    }
  }

  if (wanted.size === 0) {
    return [];
  }

  // One bound JSON value, not one `?` per folder, so the number of folders
  // can't reach SQLite's bound-parameter limit.
  const children = db
    .prepare(
      `SELECT file_id, parent_id, name FROM files
       WHERE parent_id IN (SELECT value FROM json_each(?))`,
    )
    .all(JSON.stringify([...wanted.keys()])) as unknown as Array<{
    file_id: number;
    parent_id: number;
    name: string;
  }>;

  return children
    .filter((c) =>
      wanted.get(c.parent_id)?.has(comparable(pathSegment(c.name))),
    )
    .map((c) => c.file_id);
}

/**
 * A file name in the form two spellings of it compare equal in: the DB's "/"
 * is a ":" in paths, case is folded, and accents are composed.
 *
 * @param name - A file name as a path writes it
 * @returns The name to compare by
 */
function comparable(name: string): string {
  return name.normalize("NFC").toLowerCase();
}
