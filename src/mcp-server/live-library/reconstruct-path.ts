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
 * Path style is chosen per-row from the root segment Live stored:
 *  - POSIX root ("/") → "/Users/.../file.wav"
 *  - Windows drive ("C:" or "C:\")  → "C:/Users/.../file.wav"
 *
 * Forward slashes are used for both styles. Windows native path handling
 * accepts them in Live's API and downstream tools, and they avoid having
 * to mix separators across the same string.
 */

import { type DatabaseSync } from "node:sqlite";

/** Cap walk depth (defends against pathological cycles) */
const MAX_PARENT_DEPTH = 30;

/** Matches a Windows drive-letter root segment, e.g. "C:" or "C:\". */
const WINDOWS_DRIVE_ROOT = /^([A-Za-z]):[/\\]?$/;

export interface ResolvedPath {
  /** Absolute path (forward-slash style on both POSIX and Windows) */
  path: string;
  /**
   * True when the parent chain exceeded MAX_PARENT_DEPTH so `path` is
   * missing leading segments. Callers can warn the user instead of
   * treating the truncated path as authoritative.
   */
  truncated: boolean;
}

interface WalkRow {
  root_id: number;
  name: string;
  parent_id: number;
  depth: number;
}

/**
 * Resolve absolute paths for a batch of file_ids in a single recursive
 * CTE query. Files whose chain doesn't reach root produce a partial path
 * with whatever segments were found, plus `truncated: true`.
 *
 * @param db - Open database handle
 * @param fileIds - file_ids to resolve. Empty input returns an empty map.
 * @returns Map from file_id to ResolvedPath
 */
export function resolveAbsolutePaths(
  db: DatabaseSync,
  fileIds: number[],
): Map<number, ResolvedPath> {
  const result = new Map<number, ResolvedPath>();

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
    SELECT root_id, name, parent_id, depth FROM walk
    ORDER BY root_id, depth DESC
  `;
  const rows = db.prepare(sql).all(...fileIds) as unknown as WalkRow[];
  // Group by root_id and assemble; rows are already depth-DESC per root
  // (i.e. root segment first, leaf last) thanks to the ORDER BY.
  const segmentsByRoot = new Map<number, string[]>();
  // Track the highest-depth row's parent_id per root. When the chain
  // reached the actual root row, that parent_id is 0; if the recursion
  // stopped at MAX_PARENT_DEPTH first, it's the parent_id of the
  // truncation point (non-zero).
  const headParentByRoot = new Map<number, number>();

  for (const row of rows) {
    let segs = segmentsByRoot.get(row.root_id);

    if (!segs) {
      segs = [];
      segmentsByRoot.set(row.root_id, segs);
      // First row per root_id is the highest-depth (chain head) thanks
      // to ORDER BY depth DESC.
      headParentByRoot.set(row.root_id, row.parent_id);
    }

    segs.push(row.name);
  }

  for (const [rootId, segs] of segmentsByRoot.entries()) {
    result.set(rootId, {
      path: joinPathSegments(segs),
      truncated: (headParentByRoot.get(rootId) ?? 0) !== 0,
    });
  }

  return result;
}

/**
 * Assemble path segments into an absolute path, choosing POSIX or Windows
 * style from the first (root) segment. Truncated chains where the first
 * segment is a mid-chain folder name (not "/" or "C:") fall through to
 * the POSIX branch and produce a leading "/" — the caller signals the
 * truncation separately via ResolvedPath.truncated.
 *
 * @param segs - Segments root-first, leaf-last. Must be non-empty.
 * @returns Absolute path string
 */
function joinPathSegments(segs: string[]): string {
  const root = segs[0] as string;
  const rest = segs.slice(1);
  const driveMatch = WINDOWS_DRIVE_ROOT.exec(root);

  if (driveMatch) {
    return `${(driveMatch[1] as string).toUpperCase()}:/${rest.join("/")}`;
  }

  const tail = root === "/" ? rest : segs;

  return `/${tail.join("/")}`;
}
