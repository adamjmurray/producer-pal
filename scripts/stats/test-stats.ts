#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print unit test statistics per code tree: test counts, coverage, density, and
 * timing. Reads the artifacts written by `npm run test:coverage` — it does not
 * run the suite itself.
 *
 * Requires (both produced by npm run test:coverage):
 *   test-reports/vitest.json        — vitest json reporter
 *   coverage/coverage-summary.json  — vitest json-summary coverage reporter
 *
 * Usage:
 *   node scripts/stats/test-stats.ts              # CLI tables (default)
 *   node scripts/stats/test-stats.ts --markdown   # Markdown tables (for CI)
 */

import fs from "node:fs";
import path from "node:path";
import { getCoverageThresholds } from "../build-and-release/helpers/thresholds.ts";
import {
  printCliCoverageTable,
  printCliSlowestTable,
  printCliTestTable,
  printMarkdownCoverageTable,
  printMarkdownSlowestTable,
  printMarkdownTestTable,
} from "./test-stats-printers.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const RESULTS_PATH = path.join(PROJECT_ROOT, "test-reports/vitest.json");
const COVERAGE_PATH = path.join(PROJECT_ROOT, "coverage/coverage-summary.json");

/** Trees the vitest suite covers (see `test.include` in vitest.config.ts). */
export const TREES = ["src", "webui", "evals"] as const;

export type Tree = (typeof TREES)[number];

/** How many slowest test files to list. */
const SLOWEST_COUNT = 5;

export const COVERAGE_METRICS = [
  "statements",
  "branches",
  "functions",
  "lines",
] as const;

export type CoverageMetric = (typeof COVERAGE_METRICS)[number];

interface AssertionResult {
  status: string;
}

interface FileResult {
  name: string;
  startTime: number;
  endTime: number;
  assertionResults: AssertionResult[];
}

interface VitestResults {
  testResults: FileResult[];
}

interface CoverageCounts {
  total: number;
  covered: number;
}

type CoverageFileEntry = Record<CoverageMetric, CoverageCounts>;

export interface TreeStats {
  tree: Tree;
  testFiles: number;
  tests: number;
  skipped: number;
  durationMs: number;
  sourceFiles: number;
  sourceLines: number;
  coverage: Record<CoverageMetric, CoverageCounts> | null;
}

export interface SlowestFile {
  file: string;
  tests: number;
  durationMs: number;
}

export interface TestStatsReport {
  trees: TreeStats[];
  slowest: SlowestFile[];
  overall: Record<CoverageMetric, number>;
  thresholds: Record<CoverageMetric, number>;
}

/**
 * Build the report from the test + coverage artifacts and print it.
 */
async function main(): Promise<void> {
  const markdown = process.argv.includes("--markdown");
  const results = readJson<VitestResults>(
    RESULTS_PATH,
    "npm run test:coverage",
  );
  const coverage = readJson<Record<string, CoverageFileEntry>>(
    COVERAGE_PATH,
    "npm run test:coverage",
  );

  const report: TestStatsReport = {
    trees: aggregateByTree(results, coverage),
    slowest: findSlowestFiles(results),
    overall: overallCoverage(coverage),
    thresholds: await getCoverageThresholds(),
  };

  if (markdown) {
    printMarkdownTestTable(report);
    printMarkdownSlowestTable(report);
    printMarkdownCoverageTable(report);
  } else {
    printCliTestTable(report);
    printCliSlowestTable(report);
    printCliCoverageTable(report);
    console.log();
  }
}

/**
 * Read and parse a JSON artifact, exiting with a hint if it is missing.
 * @param filePath - Absolute path to the JSON file
 * @param producer - Command that produces the file, named in the error message
 * @returns Parsed JSON contents
 */
function readJson<T>(filePath: string, producer: string): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    console.error(
      `Error: could not read ${path.relative(PROJECT_ROOT, filePath)}.\n` +
        `Run \`${producer}\` first.`,
    );
    process.exit(1);
  }
}

/**
 * Aggregate test results and coverage into per-tree stats.
 * @param results - Parsed vitest json report
 * @param coverage - Parsed coverage json-summary
 * @returns Stats per tree that has test files
 */
function aggregateByTree(
  results: VitestResults,
  coverage: Record<string, CoverageFileEntry>,
): TreeStats[] {
  const map = new Map<Tree, TreeStats>(
    TREES.map((tree) => [tree, emptyTreeStats(tree)]),
  );

  for (const file of results.testResults) {
    const stats = map.get(treeOf(file.name) as Tree);

    if (!stats) continue;

    stats.testFiles++;
    stats.durationMs += file.endTime - file.startTime;
    stats.tests += file.assertionResults.length;
    stats.skipped += file.assertionResults.filter((a) =>
      SKIPPED_STATUSES.has(a.status),
    ).length;
  }

  for (const [filePath, entry] of Object.entries(coverage)) {
    // The json-summary reporter adds a "total" key alongside the file entries.
    if (filePath === "total") continue;

    accumulateCoverage(map.get(treeOf(filePath) as Tree), entry);
  }

  return [...map.values()].filter((t) => t.testFiles > 0);
}

/** Assertion statuses that mean the test did not run. */
const SKIPPED_STATUSES = new Set(["skipped", "todo", "pending"]);

/**
 * Build a zeroed stats object for a tree.
 * @param tree - Tree name
 * @returns Empty stats
 */
function emptyTreeStats(tree: Tree): TreeStats {
  return {
    tree,
    testFiles: 0,
    tests: 0,
    skipped: 0,
    durationMs: 0,
    sourceFiles: 0,
    sourceLines: 0,
    coverage: null,
  };
}

/**
 * Add one coverage file entry into a tree's totals.
 * @param stats - Tree stats to update (no-op when undefined)
 * @param entry - Per-file coverage counts
 */
function accumulateCoverage(
  stats: TreeStats | undefined,
  entry: CoverageFileEntry,
): void {
  if (!stats) return;

  stats.coverage ??= Object.fromEntries(
    COVERAGE_METRICS.map((m) => [m, { total: 0, covered: 0 }]),
  ) as Record<CoverageMetric, CoverageCounts>;

  stats.sourceFiles++;
  stats.sourceLines += entry.lines.total;

  for (const metric of COVERAGE_METRICS) {
    stats.coverage[metric].total += entry[metric].total;
    stats.coverage[metric].covered += entry[metric].covered;
  }
}

/**
 * Determine which tree a file path belongs to.
 * @param filePath - Absolute or repo-relative file path
 * @returns Top-level directory name, or "" when outside the project
 */
function treeOf(filePath: string): string {
  const relative = path.isAbsolute(filePath)
    ? path.relative(PROJECT_ROOT, filePath)
    : filePath.replace(/^\.\//, "");

  return relative.split(path.sep)[0] ?? "";
}

/**
 * Find the slowest test files by wall-clock duration.
 * @param results - Parsed vitest json report
 * @returns Slowest files, descending
 */
function findSlowestFiles(results: VitestResults): SlowestFile[] {
  return results.testResults
    .map((file) => ({
      file: path.relative(PROJECT_ROOT, file.name),
      tests: file.assertionResults.length,
      durationMs: file.endTime - file.startTime,
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, SLOWEST_COUNT);
}

/**
 * Read the project-wide coverage percentages the thresholds are checked against.
 * @param coverage - Parsed coverage json-summary
 * @returns Percentage per metric
 */
function overallCoverage(
  coverage: Record<string, CoverageFileEntry>,
): Record<CoverageMetric, number> {
  const total = coverage.total as unknown as Record<
    CoverageMetric,
    { pct: number }
  >;

  return Object.fromEntries(
    COVERAGE_METRICS.map((m) => [m, total[m].pct]),
  ) as Record<CoverageMetric, number>;
}

await main();
