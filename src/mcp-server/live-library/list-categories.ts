// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Enumerate Live's hierarchical category taxonomy (the facets behind the
 * browser's Categories view: Sounds, Drums, Genres, Type, …) so the LLM can
 * discover the real vocabulary before constructing a tag-filtered search,
 * instead of inventing categories that drift from Live's.
 *
 * Live stores these as `Category|Sub|Leaf` strings in the `metadata` table
 * (keys CKey/Keyw) joined to `metadata_values`. The leaf segment matches a
 * `keywords` tag name, so a category leaf is directly usable as a `tags` filter
 * on library.search. Membership (which leaf lives under which category) comes
 * from `metadata`; file counts reuse the same `keywords` basis as listTags so
 * the two routes report consistent numbers.
 *
 * We surface the metadata tag hierarchy rather than Live's `vfolders` because
 * vfolder patterns are fuzzy name tokens evaluated by a proprietary FTS
 * tokenizer that sqlite can't load outside Live — see dev notes / AJM-329.
 *
 * Read-only: SELECT statements only.
 */

import { type DatabaseSync } from "node:sqlite";
import { detectStalenessRisk } from "./db-staleness.ts";
import { fourCC } from "./library-filters.ts";
import {
  clampLibraryLimit,
  DEFAULT_LIST_TAGS_LIMIT,
  type LibraryListCategoriesResult,
  type LibraryTag,
} from "./library-types.ts";
import { findLiveFilesDbPath } from "./live-db-path.ts";
import { openLiveDb } from "./live-db.ts";

export interface ListCategoriesArgs {
  /** Drill into one top-level category and return its leaf tags. Omit for the
   * top-level overview. */
  category?: string;
  /** Max leaf tags in drill-down mode. */
  limit?: number;
}

/** metadata.key fourCCs that hold `Category|Sub|Leaf` tag-path strings. */
const META_KEYS = [fourCC("CKey"), fourCC("Keyw")];

interface CategoryRow {
  name: string;
  cnt: number;
}

/**
 * Return Live's category taxonomy: a top-level overview, or — when `category`
 * is given — the leaf tags under that category with file counts.
 *
 * @param args - Optional category drill-down + limit
 * @returns Category overview or drill-down, or dbAvailable: false when Live
 *   isn't installed.
 */
export async function listCategories(
  args: ListCategoriesArgs = {},
): Promise<LibraryListCategoriesResult> {
  const dbPath = await findLiveFilesDbPath();

  if (!dbPath) {
    return { dbAvailable: false, reason: "Live database not found" };
  }

  // Best-effort advisory: flag a pending WAL from an unclean Live exit that our
  // immutable read can't see. Omitted from the response when there's no risk.
  const stalenessRisk = await detectStalenessRisk(dbPath);
  const db = openLiveDb(dbPath);

  try {
    const base = {
      dbAvailable: true as const,
      ...(stalenessRisk && { stalenessRisk }),
    };

    if (args.category != null && args.category !== "") {
      return { ...base, ...drillIntoCategory(db, args.category, args.limit) };
    }

    return { ...base, categories: listTopCategories(db) };
  } finally {
    db.close();
  }
}

/**
 * Top-level categories with their count of distinct tag-paths (a rough size
 * signal — drill-down may list fewer leaves, since it counts only leaves that
 * resolve to a keyword), sorted by size desc.
 *
 * @param db - Open database handle
 * @returns Top category names with counts
 */
function listTopCategories(db: DatabaseSync): LibraryTag[] {
  const rows = db
    .prepare(
      `SELECT substr(mv.value, 1, instr(mv.value, '|') - 1) AS name,
              COUNT(DISTINCT mv.value) AS cnt
       FROM metadata m
       JOIN metadata_values mv ON mv.id = m.value_id
       WHERE m.key IN (?, ?) AND mv.value LIKE '%|%'
       GROUP BY name
       ORDER BY cnt DESC, name ASC`,
    )
    .all(...META_KEYS) as unknown as CategoryRow[];

  return rows.map((r) => ({ name: r.name, count: r.cnt }));
}

/**
 * Resolve one category's leaf tags (membership from metadata) and their file
 * counts (from the keywords table, matching listTags), sorted by count desc.
 *
 * @param db - Open database handle
 * @param category - Top-level category name (e.g. "Drums")
 * @param limit - Max leaf tags to return
 * @returns Drill-down payload: echoed category plus its leaf tags
 */
function drillIntoCategory(
  db: DatabaseSync,
  category: string,
  limit: number | undefined,
): { category: string; tags: LibraryTag[] } {
  const leaves = categoryLeafNames(db, category);
  const cap = clampLibraryLimit(limit, DEFAULT_LIST_TAGS_LIMIT);
  const tags = leaves.length === 0 ? [] : leafTagCounts(db, leaves, cap);

  return { category, tags };
}

/**
 * Distinct leaf names (last `|` segment) of every tag-path under a category.
 *
 * @param db - Open database handle
 * @param category - Top-level category name
 * @returns Unique leaf names; empty when the category is unknown
 */
function categoryLeafNames(db: DatabaseSync, category: string): string[] {
  const pattern = `${escapeLikePrefix(category)}|%`;
  const rows = db
    .prepare(
      `SELECT DISTINCT mv.value AS value
       FROM metadata m
       JOIN metadata_values mv ON mv.id = m.value_id
       WHERE m.key IN (?, ?) AND mv.value LIKE ? ESCAPE '\\'`,
    )
    .all(...META_KEYS, pattern) as unknown as Array<{ value: string }>;
  const leaves = new Set<string>();

  for (const { value } of rows) {
    const leaf = value.slice(value.lastIndexOf("|") + 1);

    if (leaf) leaves.add(leaf);
  }

  return [...leaves];
}

/**
 * File counts for a set of leaf tag names, using the same keywords-table basis
 * as listTags so counts stay consistent across routes.
 *
 * @param db - Open database handle
 * @param leaves - Leaf tag names to count
 * @param limit - Max rows to return
 * @returns Tag names with counts, sorted by count desc
 */
function leafTagCounts(
  db: DatabaseSync,
  leaves: string[],
  limit: number,
): LibraryTag[] {
  const placeholders = leaves.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT kw.name AS name, COUNT(*) AS cnt
       FROM keywords k
       JOIN files kw ON kw.file_id = k.keyw_id
       WHERE kw.name IN (${placeholders})
       GROUP BY k.keyw_id
       ORDER BY cnt DESC, kw.name ASC
       LIMIT ?`,
    )
    .all(...leaves, limit) as unknown as CategoryRow[];

  return rows.map((r) => ({ name: r.name, count: r.cnt }));
}

/**
 * Escape LIKE metacharacters so a category name with `%`/`_`/`\` matches
 * literally as a prefix (used with `ESCAPE '\'`).
 *
 * @param text - Category name
 * @returns Escaped string
 */
function escapeLikePrefix(text: string): string {
  return text.replaceAll(/[%\\_]/g, "\\$&");
}
