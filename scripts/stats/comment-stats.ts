#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print comment-volume statistics for the non-test TypeScript sources: comment
 * lines, code lines, their ratio, and the longest comment block per tree.
 *
 * The license header and lint directives are not counted — see
 * src/test/helpers/comment-scan-helpers.ts, which src/test/comment-limits.test.ts
 * ratchets these same numbers with.
 *
 * Usage:
 *   node scripts/stats/comment-stats.ts         # summary + worst offenders
 *   node scripts/stats/comment-stats.ts --all   # every file, worst first
 */

import {
  type CommentTree,
  type FileCommentStats,
  COMMENT_TREES,
  LONG_BLOCK_LINES,
  scanCommentTree,
  summarizeComments,
} from "#src/test/helpers/comment-scan-helpers.ts";
import {
  type Row,
  fmt,
  printCliTable,
  printCliTitle,
  ratio,
} from "./stats-tables.ts";

/** How many files each worst-offenders table lists. */
const WORST_COUNT = 10;

const SUMMARY_HEADERS = [
  "Tree",
  "Files",
  "Code",
  "Comment",
  "Ratio",
  "Longest",
  `Blocks ≥${LONG_BLOCK_LINES}`,
];

const FILE_HEADERS = ["File", "Comment", "Code", "Ratio", "Longest"];

/**
 * Scan every tree and print the tables.
 */
function main(): void {
  const all = process.argv.includes("--all");
  const byTree = new Map<CommentTree, FileCommentStats[]>(
    COMMENT_TREES.map((tree) => [tree, scanCommentTree(tree)]),
  );
  const files = [...byTree.values()].flat();

  printSummary(byTree);

  if (all) {
    printCliTitle("Every File");
    printCliTable(FILE_HEADERS, byCommentLines(files).map(fileRow));

    return;
  }

  printCliTitle(`Longest Comment Blocks (top ${WORST_COUNT})`);
  printCliTable(
    ["File:line", "Block", "Comment", "Code"],
    files
      .toSorted((a, b) => b.longestBlock - a.longestBlock)
      .slice(0, WORST_COUNT)
      .map((f) => [
        `${f.file}:${f.longestBlockLine}`,
        fmt(f.longestBlock),
        fmt(f.commentLines),
        fmt(f.codeLines),
      ]),
  );

  printCliTitle(`Most Comment Lines (top ${WORST_COUNT})`);
  printCliTable(
    FILE_HEADERS,
    byCommentLines(files).slice(0, WORST_COUNT).map(fileRow),
  );
}

/**
 * Print the per-tree summary table with a totals row.
 * @param byTree - Per-file stats grouped by tree
 */
function printSummary(byTree: Map<CommentTree, FileCommentStats[]>): void {
  const rows: Row[] = [];

  for (const [tree, stats] of byTree) {
    const s = summarizeComments(stats);

    rows.push([
      tree,
      fmt(s.files),
      fmt(s.codeLines),
      fmt(s.commentLines),
      ratio(s.commentLines, s.codeLines),
      fmt(s.longestBlock),
      fmt(s.longBlockFiles),
    ]);
  }

  const total = summarizeComments([...byTree.values()].flat());

  rows.push([
    "total",
    fmt(total.files),
    fmt(total.codeLines),
    fmt(total.commentLines),
    ratio(total.commentLines, total.codeLines),
    fmt(total.longestBlock),
    fmt(total.longBlockFiles),
  ]);

  printCliTitle("Comment Lines by Tree");
  printCliTable(SUMMARY_HEADERS, rows, rows.length - 1);
}

/**
 * Sort files by comment lines, most first.
 * @param files - Per-file stats
 * @returns A sorted copy
 */
function byCommentLines(files: FileCommentStats[]): FileCommentStats[] {
  return files.toSorted((a, b) => b.commentLines - a.commentLines);
}

/**
 * Format one file as a table row.
 * @param f - The file's stats
 * @returns Display row
 */
function fileRow(f: FileCommentStats): Row {
  return [
    f.file,
    fmt(f.commentLines),
    fmt(f.codeLines),
    ratio(f.commentLines, f.codeLines),
    fmt(f.longestBlock),
  ];
}

main();
