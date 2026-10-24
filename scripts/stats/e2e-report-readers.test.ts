// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readPlaywrightSuite, readVitestSuite } from "./e2e-report-readers.ts";

/**
 * Serve `report` as the JSON file any read asks for.
 * @param report - The Vitest JSON report to serve
 */
function serveReport(report: object): void {
  vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(report));
}

const BASE = {
  numPassedTests: 1,
  numFailedTests: 0,
  numPendingTests: 0,
  numTodoTests: 0,
  startTime: 1000,
};

const PASSING_FILE = {
  name: "/repo/e2e/portal/a.test.ts",
  status: "passed",
  endTime: 2000,
  assertionResults: [{ title: "works", status: "passed", duration: 5 }],
};

describe("readVitestSuite", () => {
  it("counts a test file that failed to load as a failure", () => {
    // Vitest reports a file that throws on import with no tests in it, so
    // numFailedTests stays 0.
    serveReport({
      ...BASE,
      testResults: [
        PASSING_FILE,
        {
          name: "/repo/e2e/portal/broken.test.ts",
          status: "failed",
          endTime: 1500,
          assertionResults: [],
        },
      ],
    });

    expect(readVitestSuite("Portal", "report.json").stats.failed).toBe(1);
  });

  it("doesn't count a failed file twice when its tests already failed", () => {
    serveReport({
      ...BASE,
      numFailedTests: 2,
      testResults: [
        PASSING_FILE,
        {
          name: "/repo/e2e/portal/b.test.ts",
          status: "failed",
          endTime: 1500,
          assertionResults: [
            { title: "one", status: "failed", duration: 1 },
            { title: "two", status: "failed", duration: 1 },
          ],
        },
      ],
    });

    expect(readVitestSuite("Portal", "report.json").stats.failed).toBe(2);
  });
});

describe("readPlaywrightSuite", () => {
  it("counts an error outside any test as a failure", () => {
    // A spec file that fails to load lands in `errors`, not in `unexpected`.
    serveReport({
      suites: [],
      errors: [{ message: "Error: Cannot find module './gone'" }],
      stats: { duration: 10, expected: 3, unexpected: 1, flaky: 0, skipped: 0 },
    });

    expect(readPlaywrightSuite("Docs", "report.json").stats.failed).toBe(2);
  });
});
