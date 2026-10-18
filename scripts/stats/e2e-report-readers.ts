// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Turns each end-to-end suite's JSON report (Playwright or Vitest) into the
 * same per-suite stats and per-test timings, for e2e-stats.ts.
 */

import fs from "node:fs";
import path from "node:path";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");

export interface SuiteStats {
  label: string;
  ran: boolean;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  durationMs: number;
}

export interface SlowTest {
  name: string;
  suite: string;
  durationMs: number;
}

export interface SuiteResult {
  stats: SuiteStats;
  tests: SlowTest[];
}

interface PlaywrightSpec {
  title: string;
  file: string;
  line: number;
  tests: { results: { duration: number }[] }[];
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

interface VitestReport {
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  startTime: number;
  testResults: {
    name: string;
    endTime: number;
    assertionResults: { title: string; duration?: number | null }[];
  }[];
}

/**
 * A Playwright suite's results
 * @param label - Display name for the suite
 * @param relativePath - Report path relative to the project root
 * @returns Its stats and test timings ("not run" when the report is missing)
 */
export function readPlaywrightSuite(
  label: string,
  relativePath: string,
): SuiteResult {
  const report = readReport(relativePath) as PlaywrightReport | null;

  if (!report) {
    return notRun(label);
  }

  const { stats } = report;
  const tests = collectSpecs(report.suites).map((spec) => ({
    name: `${spec.file}:${spec.line} › ${spec.title}`,
    suite: label,
    // Sum retries: the total time the suite spent on this test.
    durationMs: spec.tests
      .flatMap((t) => t.results)
      .reduce((acc, r) => acc + r.duration, 0),
  }));

  return {
    stats: {
      label,
      ran: true,
      passed: stats.expected,
      failed: stats.unexpected,
      flaky: stats.flaky,
      skipped: stats.skipped,
      durationMs: stats.duration,
    },
    tests,
  };
}

/**
 * A Vitest suite's results, from its json reporter
 * @param label - Display name for the suite
 * @param relativePath - Report path relative to the project root
 * @returns Its stats and test timings ("not run" when the report is missing)
 */
export function readVitestSuite(
  label: string,
  relativePath: string,
): SuiteResult {
  const report = readReport(relativePath) as VitestReport | null;

  if (!report) {
    return notRun(label);
  }

  const endTime = Math.max(
    report.startTime,
    ...report.testResults.map((f) => f.endTime),
  );
  const tests = report.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      name: `${path.relative(PROJECT_ROOT, file.name)} › ${test.title}`,
      suite: label,
      durationMs: test.duration ?? 0,
    })),
  );

  return {
    stats: {
      label,
      ran: true,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      flaky: 0,
      skipped: report.numPendingTests + report.numTodoTests,
      durationMs: endTime - report.startTime,
    },
    tests,
  };
}

/**
 * Read a JSON report if it exists.
 * @param relativePath - Report path relative to the project root
 * @returns Parsed report, or null when the suite did not run
 */
function readReport(relativePath: string): unknown {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8"),
    );
  } catch {
    return null;
  }
}

/**
 * The result for a suite whose report is missing.
 * @param label - Display name for the suite
 * @returns Zeroed stats marked as not run
 */
function notRun(label: string): SuiteResult {
  return {
    stats: {
      label,
      ran: false,
      passed: 0,
      failed: 0,
      flaky: 0,
      skipped: 0,
      durationMs: 0,
    },
    tests: [],
  };
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
