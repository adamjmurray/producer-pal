#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Print end-to-end test statistics per suite: test counts, outcomes, timing,
 * and the slowest individual tests. Reads the JSON reports written by the
 * suites — it does not run them.
 *
 * Requires (produced by npm run ui:test / docs:test / e2e:portal):
 *   test-reports/playwright-ui.json
 *   test-reports/playwright-docs.json
 *   test-reports/vitest-portal.json
 *
 * A suite whose report is missing is reported as "not run" rather than failing,
 * so the CI summary still renders when an earlier suite fails and later ones
 * never start.
 *
 * Usage:
 *   node scripts/stats/e2e-stats.ts              # CLI tables (default)
 *   node scripts/stats/e2e-stats.ts --markdown   # Markdown tables (for CI)
 */

import {
  type SlowTest,
  type SuiteStats,
  readPlaywrightSuite,
  readVitestSuite,
} from "./e2e-report-readers.ts";
import {
  type Row,
  duration,
  fmt,
  printCliTable,
  printCliTitle,
  printMarkdownTable,
} from "./stats-tables.ts";

/** The CI-runnable suites, in the order CI runs them. */
const SUITES = [
  {
    label: "Chat UI",
    report: "test-reports/playwright-ui.json",
    read: readPlaywrightSuite,
  },
  {
    label: "Docs",
    report: "test-reports/playwright-docs.json",
    read: readPlaywrightSuite,
  },
  {
    label: "Portal",
    report: "test-reports/vitest-portal.json",
    read: readVitestSuite,
  },
];

/** How many slowest tests to list. */
const SLOWEST_COUNT = 5;

const TABLE_HEADERS = [
  "Suite",
  "Tests",
  "Passed",
  "Failed",
  "Flaky",
  "Skipped",
  "Duration",
];

const SLOWEST_HEADERS = ["Test", "Suite", "Duration"];

/**
 * Read each suite's report and print the e2e stats tables.
 */
function main(): void {
  const markdown = process.argv.includes("--markdown");
  const results = SUITES.map((s) => s.read(s.label, s.report));

  const stats = results.map((r) => r.stats);
  const slowest = results
    .flatMap((r) => r.tests)
    .toSorted((a, b) => b.durationMs - a.durationMs)
    .slice(0, SLOWEST_COUNT);

  if (markdown) {
    printMarkdownReport(stats, slowest);
  } else {
    printCliReport(stats, slowest);
    console.log();
  }
}

/**
 * Build the suite rows plus a totals row.
 * @param stats - Stats per suite
 * @returns Display rows, totals last
 */
function suiteRows(stats: SuiteStats[]): Row[] {
  const rows = stats.map(suiteRow);

  /**
   * Total one field across every suite.
   * @param pick - Reads the field from a suite's stats
   * @returns Sum across all suites
   */
  const sum = (pick: (s: SuiteStats) => number): number =>
    stats.reduce((acc, s) => acc + pick(s), 0);

  const passed = sum((s) => s.passed);
  const failed = sum((s) => s.failed);
  const skipped = sum((s) => s.skipped);

  rows.push([
    "Total",
    fmt(passed + failed + skipped),
    fmt(passed),
    fmt(failed),
    fmt(sum((s) => s.flaky)),
    fmt(skipped),
    duration(sum((s) => s.durationMs)),
  ]);

  return rows;
}

/**
 * Format one suite's row.
 * @param s - Suite stats
 * @returns Display row
 */
function suiteRow(s: SuiteStats): Row {
  if (!s.ran) {
    return [s.label, "not run", "–", "–", "–", "–", "–"];
  }

  return [
    s.label,
    fmt(s.passed + s.failed + s.skipped),
    fmt(s.passed),
    fmt(s.failed),
    fmt(s.flaky),
    fmt(s.skipped),
    duration(s.durationMs),
  ];
}

/**
 * Format the slowest test rows.
 * @param slowest - Slowest tests
 * @returns Display rows
 */
function slowestRows(slowest: SlowTest[]): Row[] {
  return slowest.map((s) => [s.name, s.suite, duration(s.durationMs)]);
}

/**
 * Print the CLI report.
 * @param stats - Stats per suite
 * @param slowest - Slowest tests
 */
function printCliReport(stats: SuiteStats[], slowest: SlowTest[]): void {
  const rows = suiteRows(stats);

  printCliTitle("End-to-End Tests");
  printCliTable(TABLE_HEADERS, rows, rows.length - 1);

  if (slowest.length === 0) {
    return;
  }

  printCliTitle("Slowest End-to-End Tests");
  printCliTable(SLOWEST_HEADERS, slowestRows(slowest));
}

/**
 * Print the markdown report.
 * @param stats - Stats per suite
 * @param slowest - Slowest tests
 */
function printMarkdownReport(stats: SuiteStats[], slowest: SlowTest[]): void {
  const rows = suiteRows(stats);

  console.log("\n## End-to-End Tests\n");
  printMarkdownTable(TABLE_HEADERS, rows, rows.length - 1);

  if (slowest.length === 0) {
    return;
  }

  console.log("<details><summary>Slowest end-to-end tests</summary>\n");
  printMarkdownTable(SLOWEST_HEADERS, slowestRows(slowest));
  console.log("</details>");
}

main();
