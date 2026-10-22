// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The note an empty `kind: "preset"` search carries when racks match instead.
 * A drum kit or instrument rack is an .adg, which is kind device-group, so a
 * preset search for one finds nothing and the caller concludes it isn't
 * installed.
 *
 * Read-only: SELECT statements only.
 */

import { type DatabaseSync } from "node:sqlite";
import { type LibrarySearchArgs } from "../library-types.ts";
import { buildCandidateWhere, CANDIDATE_FROM } from "./candidate-query.ts";

/**
 * Say how many racks match when a preset search found nothing.
 *
 * @param db - Open database handle
 * @param args - The filters the answer was built from
 * @param parentId - Resolved inFolder parent, or undefined when no inFolder
 * @param found - How many items the search returned
 * @returns The note, or undefined when it doesn't apply or no rack matches
 */
export function rackKindNote(
  db: DatabaseSync,
  args: LibrarySearchArgs,
  parentId: number | undefined,
  found: number,
): string | undefined {
  if (args.kind !== "preset" || found > 0) {
    return undefined;
  }

  const { where, params } = buildCandidateWhere(
    { ...args, kind: "device-group" },
    parentId,
  );
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT f.file_id) AS n
       FROM ${CANDIDATE_FROM}
       WHERE ${where.join(" AND ")}`,
    )
    .get(...params) as { n: number };

  if (row.n === 0) {
    return undefined;
  }

  const racks = row.n === 1 ? "rack (.adg) is" : "racks (.adg) are";

  return `${row.n} matching ${racks} kind device-group`;
}
