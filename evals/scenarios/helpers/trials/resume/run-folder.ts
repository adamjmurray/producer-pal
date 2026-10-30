// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Setting up a run's results folder before its first trial.
 */

import { join } from "node:path";
import { styleText } from "node:util";
import { RESULTS_DIR } from "../../json-results/types.ts";
import { writeRunRecord } from "./run-record.ts";
import { loadResumedTrials, type ResumedTrials } from "./resumed-trials.ts";

/**
 * Record a run in its results folder (unless --no-save), and for a resume load
 * the trials already done.
 *
 * @param runId - The run id
 * @param options - Options the run uses
 * @param options.resume - Set when resuming
 * @param options.save - False for --no-save
 * @param argv - Command-line arguments the run was started with
 * @param recorded - Options to save for a later resume
 * @param resultsDir - Folder holding the run folders
 * @returns The trials already done, when resuming
 */
export async function startRunFolder(
  runId: string,
  options: { resume?: string; save?: boolean },
  argv: string[],
  recorded: object,
  resultsDir = RESULTS_DIR,
): Promise<ResumedTrials | undefined> {
  const dir = join(resultsDir, runId);
  const resumed =
    options.resume == null ? undefined : await loadResumedTrials(dir);

  if (options.save !== false) {
    await writeRunRecord(dir, { argv, options: recorded });
  }

  if (resumed != null) {
    console.log(
      styleText(
        "gray",
        `Resuming ${runId}: ${resumed.done.size} trial(s) already done`,
      ),
    );
  }

  return resumed;
}
