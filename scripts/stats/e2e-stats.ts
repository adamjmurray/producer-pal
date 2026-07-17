#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print end-to-end test statistics per Playwright suite: test counts, outcomes,
 * timing, and the slowest individual tests. Reads the JSON reports written by
 * the suites — it does not run them.
 *
 * Requires (produced by npm run ui:test / npm run docs:test):
 *   test-reports/playwright-ui.json
 *   test-reports/playwright-docs.json
 *
 * A suite whose report is missing is reported as "not run" rather than failing,
 * so the CI summary still renders when an earlier suite fails and later ones
 * never start.
 *
 * Usage:
 *   node scripts/stats/e2e-stats.ts              # CLI tables (default)
 *   node scripts/stats/e2e-stats.ts --markdown   # Markdown tables (for CI)
 */

import fs from "node:fs";
import path from "node:path";
import {
  type Row,
  duration,
  fmt,
  printCliTable,
  printCliTitle,
  printMarkdownTable,
} from "./stats-tables.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");

/** The CI-runnable Playwright suites, in the order CI runs them. */
const SUITES = [
  { label: "Chat UI", report: "test-reports/playwright-ui.json" },
  { label: "Docs", report: "test-reports/playwright-docs.json" },
] as const;

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

interface PlaywrightResult {
  duration: number;
}

interface PlaywrightTest {
  results: PlaywrightResult[];
}

interface PlaywrightSpec {
  title: string;
  file: string;
  line: number;
  tests: PlaywrightTest[];
}

interface PlaywrightSuite {
  specs?: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightReport {
  suites: PlaywrightSuite[];
  stats: {
    duration: number;
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
  };
}

interface SuiteStats {
  label: string;
  ran: boolean;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
}

interface SlowTest {
  name: string;
  suite: string;
  durationMs: number;
}

/**
 * Read each suite's report and print the e2e stats tables.
 */
function main(): void {
  const markdown = process.argv.includes("--markdown");
  const reports = SUITES.map((suite) => ({
    label: suite.label,
    report: readReport(suite.report),
  }));

  const stats = reports.map(({ label, report }) => toSuiteStats(label, report));
  const slowest = findSlowestTests(reports);

  if (markdown) {
    printMarkdownReport(stats, slowest);
  } else {
    printCliReport(stats, slowest);
    console.log();
  }
}

/**
 * Read a Playwright JSON report if it exists.
 * @param relativePath - Report path relative to the project root
 * @returns Parsed report, or null when the suite did not run
 */
function readReport(relativePath: string): PlaywrightReport | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8"),
    ) as PlaywrightReport;
  } catch {
    return null;
  }
}

/**
 * Convert a Playwright report into suite stats.
 * @param label - Display name for the suite
 * @param report - Parsed report, or null when the suite did not run
 * @returns Suite stats
 */
function toSuiteStats(
  label: string,
  report: PlaywrightReport | null,
): SuiteStats {
  if (!report) {
    return {
      label,
      ran: false,
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
      durationMs: 0,
    };
  }

  const { stats } = report;

  return {
    label,
    ran: true,
    passed: stats.expected,
    failed: stats.unexpected,
    flaky: stats.flaky,
    skipped: stats.skipped,
    durationMs: stats.duration,
  };
}

/**
 * Find the slowest individual tests across all suites.
 * @param reports - Each suite's label and parsed report
 * @returns Slowest tests, descending
 */
function findSlowestTests(
  reports: { label: string; report: PlaywrightReport | null }[],
): SlowTest[] {
  const all: SlowTest[] = [];

  for (const { label, report } of reports) {
    for (const spec of collectSpecs(report?.suites ?? [])) {
      // Sum retries: the total time the suite spent on this test.
      const durationMs = spec.tests
        .flatMap((t) => t.results)
        .reduce((acc, r) => acc + r.duration, 0);

      all.push({
        name: `${spec.file}:${spec.line} › ${spec.title}`,
        suite: label,
        durationMs,
      });
    }
  }

  return all
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, SLOWEST_COUNT);
}

/**
 * Flatten Playwright's nested suite tree into a flat list of specs.
 * @param suites - Suites to walk
 * @returns Every spec found, at any depth
 */
function collectSpecs(suites: PlaywrightSuite[]): PlaywrightSpec[] {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []),
    ...collectSpecs(suite.suites ?? []),
  ]);
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
  if (!s.ran) return [s.label, "not run", "–", "–", "–", "–", "–"];

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

  if (slowest.length === 0) return;

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

  if (slowest.length === 0) return;

  console.log("<details><summary>Slowest end-to-end tests</summary>\n");
  printMarkdownTable(SLOWEST_HEADERS, slowestRows(slowest));
  console.log("</details>");
}

main();
