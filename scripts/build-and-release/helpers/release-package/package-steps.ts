// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** One stage of `npm run release:package`. */
export interface PackageStep {
  name: string;
  writes: string[];
  run: () => void;
}

/** How a run of steps ended. */
export interface PackageResult {
  failed: { step: string; error: string } | null;
  written: string[];
  partial: string[];
  notWritten: string[];
}

/**
 * Run the steps in order and stop at the first failure.
 *
 * @param steps - The steps to run
 * @returns What was written, and what the failure left behind
 */
export function runPackageSteps(steps: PackageStep[]): PackageResult {
  const result: PackageResult = {
    failed: null,
    written: [],
    partial: [],
    notWritten: [],
  };

  for (const [index, step] of steps.entries()) {
    try {
      step.run();
      result.written.push(...step.writes);
    } catch (error) {
      result.failed = {
        step: step.name,
        error: String(error),
      };
      result.partial = step.writes;
      result.notWritten = steps.slice(index + 1).flatMap((s) => s.writes);

      return result;
    }
  }

  return result;
}

/**
 * Say what a failed run left on disk.
 *
 * @param result - A failed result from runPackageSteps
 * @returns Text to print
 */
export function describePackageFailure(result: PackageResult): string {
  const lines = [
    `Packaging failed at "${result.failed?.step ?? "?"}": ${result.failed?.error ?? ""}`,
    "",
    `Written: ${list(result.written)}`,
    `May be incomplete: ${list(result.partial)}`,
    `Not written: ${list(result.notWritten)}`,
    "",
    "The folders now hold a partial package. Fix the cause and re-run",
    "`npm run release:package`; don't publish or upload from this state.",
  ];

  return lines.join("\n");
}

/**
 * Join paths for one line of output.
 *
 * @param paths - Paths to show
 * @returns The paths, or "nothing"
 */
function list(paths: string[]): string {
  return paths.length === 0 ? "nothing" : paths.join(", ");
}
