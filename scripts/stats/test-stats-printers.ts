// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print functions for the unit test statistics tables (CLI and markdown).
 */

import {
  type Row,
  duration,
  fmt,
  pct,
  printCliNote,
  printCliTable,
  printCliTitle,
  printMarkdownTable,
  ratio,
} from "./stats-tables.ts";
import {
  type TestStatsReport,
  type TreeStats,
  COVERAGE_METRICS,
} from "./test-stats.ts";

const TEST_HEADERS = [
  "Tree",
  "Tests",
  "Test Files",
  "Skipped",
  "Tests/File",
  "Duration",
];

const COVERAGE_HEADERS = [
  "Tree",
  "Statements",
  "Branches",
  "Functions",
  "Lines",
  "Tests/100 Src Lines",
];

const SLOWEST_HEADERS = ["Test File", "Tests", "Duration"];

/** Explains the dashes in the coverage table. */
const COVERAGE_NOTE =
  "Coverage measures the user-facing product code (`src`, `webui`). " +
  "A `–` marks a tree whose tests run but whose own source is not measured " +
  "— dev tooling, not shipped code.";

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

  rows.push([
    "Total",
    fmt(tests),
    fmt(testFiles),
    fmt(sum((t) => t.skipped)),
    ratio(tests, testFiles),
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
    fmt(t.tests),
    fmt(t.testFiles),
    fmt(t.skipped),
    ratio(t.tests, t.testFiles),
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

      // Unmeasured trees (see coverage.include in vitest.config.ts) have no
      // counts at all — COVERAGE_NOTE explains the dash.
      if (!counts?.total) return "–";

      return pct((counts.covered / counts.total) * 100);
    }),
    // Density belongs here: its source-line count comes from the coverage data,
    // so it is dashed for unmeasured trees for the same reason.
    ratio(t.tests * 100, t.sourceLines),
  ]);

  const measured = report.trees.filter((t) => t.sourceLines > 0);
  const totalTests = measured.reduce((acc, t) => acc + t.tests, 0);
  const totalSourceLines = measured.reduce((acc, t) => acc + t.sourceLines, 0);

  rows.push([
    "Overall",
    ...COVERAGE_METRICS.map((m) => pct(report.overall[m])),
    ratio(totalTests * 100, totalSourceLines),
  ]);
  rows.push([
    "Min required",
    ...COVERAGE_METRICS.map((m) => pct(report.thresholds[m])),
    "",
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
  printCliNote(COVERAGE_NOTE);
}

/**
 * Print the CLI slowest test files table.
 * @param report - Aggregated stats
 */
export function printCliSlowestTable(report: TestStatsReport): void {
  printCliTitle("Slowest Test Files");
  printCliTable(SLOWEST_HEADERS, slowestRows(report));
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
  console.log(COVERAGE_NOTE);
  console.log();
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
