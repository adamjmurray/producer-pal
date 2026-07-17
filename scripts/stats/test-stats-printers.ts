// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print functions for the unit test statistics tables (CLI and markdown).
 */

import { styleText } from "node:util";
import {
  type TestStatsReport,
  type TreeStats,
  COVERAGE_METRICS,
} from "./test-stats.ts";

/** A row of the per-tree test table, pre-formatted for display. */
type Row = string[];

const TEST_HEADERS = [
  "Tree",
  "Test Files",
  "Tests",
  "Skipped",
  "Tests/File",
  "Tests/100 Src Lines",
  "Duration",
];

const COVERAGE_HEADERS = [
  "Tree",
  "Statements",
  "Branches",
  "Functions",
  "Lines",
];

const SLOWEST_HEADERS = ["Test File", "Tests", "Duration"];

/**
 * Format the per-tree test rows plus a totals row.
 * @param report - Aggregated stats
 * @returns Display rows, totals last
 */
function testRows(report: TestStatsReport): Row[] {
  const rows = report.trees.map(testRow);

  /**
   * Total one field across every tree.
   * @param pick - Reads the field from a tree's stats
   * @returns Sum across all trees
   */
  const sum = (pick: (t: TreeStats) => number): number =>
    report.trees.reduce((acc, t) => acc + pick(t), 0);

  const tests = sum((t) => t.tests);
  const testFiles = sum((t) => t.testFiles);
  const sourceLines = sum((t) => t.sourceLines);

  rows.push([
    "Total",
    fmt(testFiles),
    fmt(tests),
    fmt(sum((t) => t.skipped)),
    ratio(tests, testFiles),
    ratio(tests * 100, sourceLines),
    duration(sum((t) => t.durationMs)),
  ]);

  return rows;
}

/**
 * Format one tree's test row.
 * @param t - Tree stats
 * @returns Display row
 */
function testRow(t: TreeStats): Row {
  return [
    t.tree,
    fmt(t.testFiles),
    fmt(t.tests),
    fmt(t.skipped),
    ratio(t.tests, t.testFiles),
    ratio(t.tests * 100, t.sourceLines),
    duration(t.durationMs),
  ];
}

/**
 * Format the per-tree coverage rows, then overall, then the thresholds.
 * @param report - Aggregated stats
 * @returns Display rows, overall second-to-last and min-required last
 */
function coverageRows(report: TestStatsReport): Row[] {
  const rows: Row[] = report.trees.map((t) => [
    t.tree,
    ...COVERAGE_METRICS.map((m) => {
      const counts = t.coverage?.[m];

      // evals is coverage-excluded in vitest.config.ts, so it has no counts.
      if (!counts?.total) return "–";

      return pct((counts.covered / counts.total) * 100);
    }),
  ]);

  rows.push([
    "Overall",
    ...COVERAGE_METRICS.map((m) => pct(report.overall[m])),
  ]);
  rows.push([
    "Min required",
    ...COVERAGE_METRICS.map((m) => pct(report.thresholds[m])),
  ]);

  return rows;
}

/**
 * Format the slowest test file rows.
 * @param report - Aggregated stats
 * @returns Display rows
 */
function slowestRows(report: TestStatsReport): Row[] {
  return report.slowest.map((s) => [
    s.file,
    fmt(s.tests),
    duration(s.durationMs),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print the CLI per-tree test table.
 * @param report - Aggregated stats
 */
export function printCliTestTable(report: TestStatsReport): void {
  const rows = testRows(report);

  printCliTitle("Unit Tests by Tree");
  printCliTable(TEST_HEADERS, rows, rows.length - 1);
}

/**
 * Print the CLI per-tree coverage table.
 * @param report - Aggregated stats
 */
export function printCliCoverageTable(report: TestStatsReport): void {
  const rows = coverageRows(report);

  printCliTitle("Unit Test Coverage by Tree");
  printCliTable(COVERAGE_HEADERS, rows, rows.length - 2);
}

/**
 * Print the CLI slowest test files table.
 * @param report - Aggregated stats
 */
export function printCliSlowestTable(report: TestStatsReport): void {
  printCliTitle("Slowest Test Files");
  printCliTable(SLOWEST_HEADERS, slowestRows(report));
}

/**
 * Print an aligned, colored CLI table.
 * @param headers - Column headers
 * @param rows - Display rows
 * @param summaryIdx - Row index to render as a highlighted summary row
 */
function printCliTable(headers: string[], rows: Row[], summaryIdx = -1): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );

  /**
   * Format one row with padding and color.
   * @param values - Cell values
   * @param color - Styler to apply
   * @returns Aligned row string
   */
  const line = (values: Row, color: (s: string) => string): string =>
    widths
      .map((w, i) => {
        const val = values[i] ?? "";

        return color(i === 0 ? val.padEnd(w) : val.padStart(w));
      })
      .join("  ");

  console.log(line(headers, (s) => s));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));

  for (const [i, row] of rows.entries()) {
    if (i === summaryIdx) {
      console.log(line(row, (s) => styleText(["yellow", "bold"], s)));
    } else {
      console.log(line(row, (s) => styleText("green", s)));
    }
  }
}

/**
 * Print a bold CLI title with an underline.
 * @param title - Title text
 */
function printCliTitle(title: string): void {
  console.log(`\n${styleText("bold", title)}`);
  console.log("=".repeat(title.length));
  console.log();
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Print the markdown per-tree test table.
 * @param report - Aggregated stats
 */
export function printMarkdownTestTable(report: TestStatsReport): void {
  const rows = testRows(report);

  console.log("\n## Unit Tests\n");
  printMarkdownTable(TEST_HEADERS, rows, rows.length - 1);
}

/**
 * Print the markdown per-tree coverage table.
 * @param report - Aggregated stats
 */
export function printMarkdownCoverageTable(report: TestStatsReport): void {
  const rows = coverageRows(report);

  console.log("\n## Unit Test Coverage\n");
  printMarkdownTable(COVERAGE_HEADERS, rows, rows.length - 2);
}

/**
 * Print the markdown slowest test files table, collapsed in a details block.
 * @param report - Aggregated stats
 */
export function printMarkdownSlowestTable(report: TestStatsReport): void {
  console.log("\n<details><summary>Slowest test files</summary>\n");
  printMarkdownTable(SLOWEST_HEADERS, slowestRows(report));
  console.log("</details>");
}

/**
 * Print a markdown table with a left-aligned first column.
 * @param headers - Column headers
 * @param rows - Display rows
 * @param summaryIdx - Row index to bold
 */
function printMarkdownTable(
  headers: string[],
  rows: Row[],
  summaryIdx = -1,
): void {
  console.log(mdRow(headers));
  console.log(mdRow(headers.map((_, i) => (i === 0 ? ":--" : "--:"))));

  for (const [i, row] of rows.entries()) {
    console.log(mdRow(i === summaryIdx ? row.map((c) => `**${c}**`) : row));
  }

  console.log();
}

/**
 * Format a markdown table row.
 * @param cells - Cell values
 * @returns Pipe-delimited markdown row
 */
function mdRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Value formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a number with comma separators.
 * @param n - Number to format
 * @returns Formatted string
 */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Format a ratio to 1 decimal place, guarding division by zero.
 * @param numerator - Top of the ratio
 * @param denominator - Bottom of the ratio
 * @returns Formatted ratio, or an en dash when undefined
 */
function ratio(numerator: number, denominator: number): string {
  return denominator > 0 ? (numerator / denominator).toFixed(1) : "–";
}

/**
 * Format a coverage percentage to 1 decimal place.
 * @param value - Percentage
 * @returns Formatted percentage
 */
function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format a duration in milliseconds as seconds.
 * @param ms - Milliseconds
 * @returns Formatted duration
 */
function duration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
