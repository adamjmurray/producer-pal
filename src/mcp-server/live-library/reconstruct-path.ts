// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Reconstruct files' absolute paths by walking parent_id up to the root.
 *
 * Resolution is bulk: a single recursive CTE computes the parent chains
 * for every requested file_id. This avoids the N+1 cost of issuing one
 * SELECT per ancestor per result, which is critical at the LIMIT=50/100
 * sizes the library tools issue.
 *
 * NOTE: assumes POSIX-style paths — joins with "/" and prepends "/". On
 * Windows, Live's DB likely stores a drive root (e.g. name "C:") which
 * would produce "/C:/Users/…". Windows is currently out of scope for the
 * Live DB integration (AJM-326); revisit when/if Windows support lands.
 */

import { type DatabaseSync } from "node:sqlite";

/** Cap walk depth (defends against pathological cycles) */
const MAX_PARENT_DEPTH = 30;

interface WalkRow {
  root_id: number;
  name: string;
  depth: number;
}

/**
 * Resolve absolute paths for a batch of file_ids in a single recursive
 * CTE query. Files whose chain doesn't reach root produce a partial path
 * with whatever segments were found.
 *
 * @param db - Open database handle
 * @param fileIds - file_ids to resolve. Empty input returns an empty map.
 * @returns Map from file_id → absolute path (POSIX, leading "/")
 */
export function resolveAbsolutePaths(
  db: DatabaseSync,
  fileIds: number[],
): Map<number, string> {
  const result = new Map<number, string>();

  if (fileIds.length === 0) {
    return result;
  }

  const placeholders = fileIds.map(() => "?").join(",");
  const sql = `
    WITH RECURSIVE walk(file_id, root_id, name, parent_id, depth) AS (
      SELECT file_id, file_id AS root_id, name, parent_id, 0
      FROM files
      WHERE file_id IN (${placeholders})
      UNION ALL
      SELECT f.file_id, w.root_id, f.name, f.parent_id, w.depth + 1
      FROM files f
      JOIN walk w ON f.file_id = w.parent_id
      WHERE w.parent_id != 0 AND w.depth < ${MAX_PARENT_DEPTH}
    )
    SELECT root_id, name, depth FROM walk
    ORDER BY root_id, depth DESC
  `;
  const rows = db.prepare(sql).all(...fileIds) as unknown as WalkRow[];
  // Group by root_id and assemble; rows are already depth-DESC per root
  // (i.e. root segment first, leaf last) thanks to the ORDER BY.
  const segmentsByRoot = new Map<number, string[]>();

  for (const row of rows) {
    let segs = segmentsByRoot.get(row.root_id);

    if (!segs) {
      segs = [];
      segmentsByRoot.set(row.root_id, segs);
    }

    if (row.name !== "/") {
      segs.push(row.name);
    }
  }

  for (const [rootId, segs] of segmentsByRoot.entries()) {
    result.set(rootId, `/${segs.join("/")}`);
  }

  return result;
}
