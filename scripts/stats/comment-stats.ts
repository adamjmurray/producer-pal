#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print comment statistics for the non-test TypeScript sources: comment lines,
 * code lines, and comment density per tree against the cap the ratchet holds it
 * under, plus the longest comment blocks.
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
  COMMENT_DENSITY_LIMITS,
  LONG_BLOCK_ALLOWANCES,
  MAX_BLOCK_LINES,
  MAX_LONG_BLOCK_ALLOWANCES,
} from "#src/test/helpers/comment-limits.ts";
import {
  type CommentSummary,
  type CommentTree,
  type FileCommentStats,
  COMMENT_TREES,
  commentDensity,
  scanCommentTree,
  summarizeComments,
} from "#src/test/helpers/comment-scan-helpers.ts";
import {
  type Row,
  fmt,
  printCliNote,
  printCliTable,
  printCliTitle,
  printMarkdownTable,
} from "./stats-tables.ts";

/** How many files each worst-offenders table lists. */
const WORST_COUNT = 10;

/** How many files the markdown longest-block table lists. */
const MARKDOWN_WORST_COUNT = 5;

const SUMMARY_HEADERS = [
  "Tree",
  "Files",
  "Code",
  "Comment",
  "Density",
  "Density (max)",
  "Longest",
];

const FILE_HEADERS = ["File", "Comment", "Code", "Density", "Longest"];

/** The totals row has no density cap of its own. */
const NO_CAP = "—";

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

  printCliTitle("Comments by Tree");

  const rows = summaryRows(byTree);

  printCliTable(SUMMARY_HEADERS, rows, rows.length - 1);
  printCliNote(blockNote());

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

  console.log("\n## Comments\n");
  printMarkdownTable(SUMMARY_HEADERS, rows, rows.length - 1);
  console.log(`${blockNote()}\n`);

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
  const rows = [...byTree].map(([tree, stats]) =>
    summaryRow(
      tree,
      summarizeComments(stats),
      COMMENT_DENSITY_LIMITS[tree].toFixed(3),
    ),
  );

  rows.push(
    summaryRow("total", summarizeComments([...byTree.values()].flat()), NO_CAP),
  );

  return rows;
}

/**
 * Format one summary line as a table row.
 * @param label - Tree name, or "total"
 * @param s - The line's totals
 * @param cap - The density cap those totals are held under
 * @returns Display row
 */
function summaryRow(label: string, s: CommentSummary, cap: string): Row {
  return [
    label,
    fmt(s.files),
    fmt(s.codeLines),
    fmt(s.commentLines),
    density(s),
    cap,
    fmt(s.longestBlock),
  ];
}

/**
 * Describe the block cap and how many files hold an allowance over it.
 * @returns A one-line note
 */
function blockNote(): string {
  const allowances = Object.keys(LONG_BLOCK_ALLOWANCES).length;

  return (
    `Comment blocks: ${MAX_BLOCK_LINES} lines max, ` +
    `with ${allowances}/${MAX_LONG_BLOCK_ALLOWANCES} files allowed to keep a ` +
    "longer one they already had."
  );
}

/**
 * Format comment lines per code line.
 * @param counts - Any comment and code line counts
 * @returns The density to 3 decimals
 */
function density(counts: FileCommentStats | CommentSummary): string {
  return commentDensity(counts).toFixed(3);
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
    density(f),
    fmt(f.longestBlock),
  ];
}

main();
