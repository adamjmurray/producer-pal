#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print comment-volume statistics for the non-test TypeScript sources: comment
 * lines, code lines, their ratio, and the longest comment block per tree, each
 * against the cap the ratchet holds it under.
 *
 * The license header and lint directives are not counted — see
 * src/test/helpers/comment-scan-helpers.ts, which src/test/comment-limits.test.ts
 * ratchets these same numbers with.
 *
 * Usage:
 *   node scripts/stats/comment-stats.ts              # summary + worst offenders
 *   node scripts/stats/comment-stats.ts --all        # every file, worst first
 *   node scripts/stats/comment-stats.ts --markdown   # Markdown tables (for CI)
 */

import {
  COMMENT_LINE_LIMITS,
  LONG_BLOCK_FILE_LIMITS,
  LONGEST_BLOCK_LIMITS,
} from "#src/test/helpers/comment-limits.ts";
import {
  type CommentSummary,
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
  printMarkdownTable,
  ratio,
} from "./stats-tables.ts";

/** How many files each worst-offenders table lists. */
const WORST_COUNT = 10;

/** How many files the markdown longest-block table lists. */
const MARKDOWN_WORST_COUNT = 5;

const BLOCKS_LABEL = `Blocks ≥${LONG_BLOCK_LINES}`;

const SUMMARY_HEADERS = [
  "Tree",
  "Files",
  "Code",
  "Comment",
  "Comment (max)",
  "Ratio",
  "Longest",
  "Longest (max)",
  BLOCKS_LABEL,
  `${BLOCKS_LABEL} (max)`,
];

const FILE_HEADERS = ["File", "Comment", "Code", "Ratio", "Longest"];

/** The three caps that apply to one tree, or to the repo as a whole. */
interface Caps {
  commentLines: number;
  longestBlock: number;
  longBlockFiles: number;
}

/**
 * Scan every tree and print the tables.
 */
function main(): void {
  const byTree = new Map<CommentTree, FileCommentStats[]>(
    COMMENT_TREES.map((tree) => [tree, scanCommentTree(tree)]),
  );
  const files = [...byTree.values()].flat();

  if (process.argv.includes("--markdown")) {
    printMarkdownReport(byTree, files);

    return;
  }

  printCliTitle("Comment Lines by Tree");

  const rows = summaryRows(byTree);

  printCliTable(SUMMARY_HEADERS, rows, rows.length - 1);

  if (process.argv.includes("--all")) {
    printCliTitle("Every File");
    printCliTable(FILE_HEADERS, byCommentLines(files).map(fileRow));

    return;
  }

  printCliTitle(`Longest Comment Blocks (top ${WORST_COUNT})`);
  printCliTable(
    ["File:line", "Block", "Comment", "Code"],
    byLongestBlock(files, WORST_COUNT).map((f) => [
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
 * Print the markdown report: the per-tree summary plus the longest blocks.
 * @param byTree - Per-file stats grouped by tree
 * @param files - Every scanned file
 */
function printMarkdownReport(
  byTree: Map<CommentTree, FileCommentStats[]>,
  files: FileCommentStats[],
): void {
  const rows = summaryRows(byTree);

  console.log("\n## Comment Volume\n");
  printMarkdownTable(SUMMARY_HEADERS, rows, rows.length - 1);

  console.log("<details><summary>Longest comment blocks</summary>\n");
  printMarkdownTable(
    ["File:line", "Block lines"],
    byLongestBlock(files, MARKDOWN_WORST_COUNT).map((f): Row => [
      `${f.file}:${f.longestBlockLine}`,
      fmt(f.longestBlock),
    ]),
  );
  console.log("</details>");
}

/**
 * Build the per-tree summary rows, ending with a totals row.
 * @param byTree - Per-file stats grouped by tree
 * @returns One row per tree, then the totals
 */
function summaryRows(byTree: Map<CommentTree, FileCommentStats[]>): Row[] {
  const rows: Row[] = [];
  const totalCaps: Caps = {
    commentLines: 0,
    longestBlock: 0,
    longBlockFiles: 0,
  };

  for (const [tree, stats] of byTree) {
    const caps = treeCaps(tree);

    totalCaps.commentLines += caps.commentLines;
    totalCaps.longBlockFiles += caps.longBlockFiles;
    totalCaps.longestBlock = Math.max(
      totalCaps.longestBlock,
      caps.longestBlock,
    );

    rows.push(summaryRow(tree, summarizeComments(stats), caps));
  }

  rows.push(
    summaryRow(
      "total",
      summarizeComments([...byTree.values()].flat()),
      totalCaps,
    ),
  );

  return rows;
}

/**
 * Format one summary line as a table row.
 * @param label - Tree name, or "total"
 * @param s - The line's totals
 * @param caps - The caps those totals are held under
 * @returns Display row
 */
function summaryRow(label: string, s: CommentSummary, caps: Caps): Row {
  return [
    label,
    fmt(s.files),
    fmt(s.codeLines),
    fmt(s.commentLines),
    fmt(caps.commentLines),
    ratio(s.commentLines, s.codeLines),
    fmt(s.longestBlock),
    fmt(caps.longestBlock),
    fmt(s.longBlockFiles),
    fmt(caps.longBlockFiles),
  ];
}

/**
 * Collect one tree's three caps.
 * @param tree - Tree name
 * @returns The tree's caps
 */
function treeCaps(tree: CommentTree): Caps {
  return {
    commentLines: COMMENT_LINE_LIMITS[tree],
    longestBlock: LONGEST_BLOCK_LIMITS[tree],
    longBlockFiles: LONG_BLOCK_FILE_LIMITS[tree],
  };
}

/**
 * Take the files with the longest comment blocks.
 * @param files - Per-file stats
 * @param count - How many files to keep
 * @returns The worst files, longest block first
 */
function byLongestBlock(
  files: FileCommentStats[],
  count: number,
): FileCommentStats[] {
  return files
    .toSorted((a, b) => b.longestBlock - a.longestBlock)
    .slice(0, count);
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
