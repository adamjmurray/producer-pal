// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The note a library answer carries when the default left matching files out
 * of plug-in preset folders (Live's browser doesn't list them).
 *
 * Read-only: SELECT statements only.
 */

import { type DatabaseSync } from "node:sqlite";
import { type LibrarySearchArgs } from "../library-types.ts";
import { buildCandidateWhere, CANDIDATE_FROM } from "./candidate-query.ts";

/**
 * Say so when the default left matching files out of plug-in preset folders,
 * under the same filters. Nothing to say when a source or folder was asked
 * for: neither applies the default. A search says how many. Find-similar and
 * find-duplicates can't: they drop seed copies and lone files.
 *
 * @param db - Open database handle
 * @param args - The filters the answer was built from
 * @param parentId - Resolved inFolder parent, or undefined when no inFolder
 * @param options - How the caller builds its candidates
 * @param options.sourceShowsHidden - As for buildCandidateWhere
 * @param options.analyzedOnly - Look only at files with an audio analysis, which
 *   is all findSimilar and findDuplicates consider, and give no count
 * @returns The note, or undefined when no matching file was left out
 */
export function presetFolderNote(
  db: DatabaseSync,
  args: LibrarySearchArgs,
  parentId: number | undefined,
  {
    sourceShowsHidden,
    analyzedOnly = false,
  }: { sourceShowsHidden?: boolean; analyzedOnly?: boolean } = {},
): string | undefined {
  if (args.source != null || parentId != null) {
    return undefined;
  }

  const { where, params } = buildCandidateWhere(args, parentId, {
    sourceShowsHidden,
    presetFoldersOnly: true,
  });
  const join = analyzedOnly
    ? "JOIN fe_values fv ON fv.file_id = f.file_id"
    : "";
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT f.file_id) AS n
       FROM ${CANDIDATE_FROM} ${join}
       WHERE ${where.join(" AND ")}`,
    )
    .get(...params) as { n: number };

  if (row.n === 0) {
    return undefined;
  }

  const tail =
    "in plug-in preset folders left out; source: preset-folder includes them";

  if (analyzedOnly) {
    return `Files ${tail}`;
  }

  return `${row.n} matching ${row.n === 1 ? "file" : "files"} ${tail}`;
}
