// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Minimal vitest reporter that only shows failures and a final summary line.
 * Used by npm run test/check to reduce output verbosity.
 */
export default class MinimalReporter {
  failures = [];
  testCount = 0;

  onTestCaseResult(testCase) {
    this.testCount++;
    // Check task.result.state for the actual test state
    const state = testCase.task?.result?.state;
    if (state === "fail") {
      this.failures.push(testCase);
    }
  }

  onTestRunEnd(testModules) {
    const files = testModules.length;

    // Print failures with error messages
    for (const test of this.failures) {
      process.stdout.write(`\n❌ ${test.fullName}\n`);
      const errors = test.task?.result?.errors;
      if (errors?.length) {
        for (const error of errors) {
          const msg = error.message || error.stack || String(error);
          process.stdout.write(`   ${msg}\n`);
        }
      }
    }

    // Single summary line
    const status = this.failures.length > 0 ? "❌" : "✓";
    const failedCount = this.failures.length;
    const passedCount = this.testCount - failedCount;
    process.stdout.write(
      `\n${status} ${files} files, ${passedCount} passed, ${failedCount} failed\n`,
    );
  }
}
