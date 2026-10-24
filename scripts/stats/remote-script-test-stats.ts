// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reads the remote script's Python test results for the unit test report.
 * Python's unittest has no JSON reporter, so CI saves its text output to
 * REMOTE_SCRIPT_LOG and this parses the closing summary lines.
 */

import fs from "node:fs";
import path from "node:path";
import { type TreeStats } from "./test-stats.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const TESTS_DIR = path.join(PROJECT_ROOT, "remote-script/tests");

/** Where CI saves `npm run remote-script:test` output. */
export const REMOTE_SCRIPT_LOG = "test-reports/remote-script.log";

/**
 * The Python suite as a test-table row
 * @returns Its stats, or null when no log was saved
 */
export function readRemoteScriptStats(): TreeStats | null {
  let log: string;

  try {
    log = fs.readFileSync(path.join(PROJECT_ROOT, REMOTE_SCRIPT_LOG), "utf8");
  } catch {
    return null;
  }

  const ran = /^Ran (\d+) tests? in ([\d.]+)s$/m.exec(log);

  if (!ran) {
    return null;
  }

  const skipped = /^(?:OK|FAILED) \(.*\bskipped=(\d+)/m.exec(log);

  return {
    tree: "remote-script",
    testFiles: fs.readdirSync(TESTS_DIR).filter((f) => /^test_.*\.py$/.test(f))
      .length,
    tests: Number(ran[1]),
    skipped: Number(skipped?.[1] ?? 0),
    durationMs: Number(ran[2]) * 1000,
    sourceFiles: 0,
    sourceLines: 0,
    coverage: null,
  };
}
