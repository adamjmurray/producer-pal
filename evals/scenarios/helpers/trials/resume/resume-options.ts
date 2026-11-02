// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The options a run uses: the command's own, or with `--resume` the original
 * run's, replayed from its run record, with more rounds and display flags the
 * only changes allowed.
 */

import { join } from "node:path";
import { type Command } from "commander";
import { RESULTS_DIR } from "../../json-results/types.ts";
import { parseRepeatCount } from "../multi-trial-runs.ts";
import { readRunRecord, type RunRecord } from "./run-record.ts";

/** Changing anything else would mix two different runs in one folder. */
const RESUME_FLAGS = new Set(["--resume", "--repeat", "--quiet", "--usage"]);

export interface ResumableOptions {
  resume?: string;
  repeat?: string;
  quiet?: boolean;
  usage?: boolean;
}

/**
 * Settle the options a run uses, and the command line to record for it.
 *
 * @param command - The parsed CLI command
 * @param given - Options from the command line
 * @param resultsDir - Folder holding the run folders
 * @returns The command line and options; for a resume, the original run's
 */
export async function resumeOptions<Options extends ResumableOptions>(
  command: Command,
  given: Options,
  resultsDir = RESULTS_DIR,
): Promise<RunRecord<Options>> {
  const runId = given.resume;

  if (runId == null) {
    return { argv: process.argv.slice(2), options: given };
  }

  const refused = command.options
    .filter((o) => command.getOptionValueSource(o.attributeName()) === "cli")
    .map((o) => o.long ?? o.flags)
    .filter((flag) => !RESUME_FLAGS.has(flag));

  if (refused.length > 0) {
    throw new Error(
      `--resume replays the run's own options and only takes -r, -q and -u (got ${refused.join(", ")})`,
    );
  }

  const record = await readRunRecord<Options>(join(resultsDir, runId));
  const rounds = parseRepeatCount(record.options.repeat);

  if (given.repeat != null && parseRepeatCount(given.repeat) < rounds) {
    throw new Error(
      `-r can't go below the run's own ${rounds} round(s) when resuming`,
    );
  }

  return {
    argv: record.argv,
    options: {
      ...record.options,
      resume: runId,
      repeat: given.repeat ?? record.options.repeat,
      quiet: given.quiet,
      usage: given.usage,
    },
  };
}
