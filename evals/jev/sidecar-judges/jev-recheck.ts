#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * One command to check Jev on a finished `--jev` run: re-judge the saved
 * results with the LLM judges that haven't judged them yet, then compare the
 * Jev answers recorded in the run with the majority of those judges. No
 * Ableton, no model re-run, no Jev calls.
 *
 * Run: node --env-file=.env evals/jev/sidecar-judges/jev-recheck.ts <run-dir|run-id>... [flags]
 *   --judges=a,b   LLM judges to add (provider/model, comma-separated).
 *                  Default codex-code/luna. Others (e.g. anthropic/claude-haiku-5-5)
 *                  cost money; judges already in the run's judges/ folder are
 *                  used as references without being run again.
 *   --results-dir=D  default evals/results (taken from a run directory path)
 *   --dry-run      count what would be judged; make no calls and no report
 *
 * The report is the one `jev-compare.ts --recorded` prints.
 */

import { readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { RESULTS_DIR } from "#evals/scenarios/helpers/json-results/types.ts";
import { runJevCompare, type CompareDeps } from "../jev-compare.ts";
import { runRejudge, type RejudgeDeps } from "./jev-rejudge.ts";
import { judgeSlug, SIDECAR_DIR } from "./jev-sidecar.ts";

const DEFAULT_JUDGES = ["codex-code/luna"];

export interface RecheckArgs {
  runIds: string[];
  judges: string[];
  resultsDir: string;
  dryRun: boolean;
}

/** Test seams: passed to the re-judge and the comparison. */
export interface RecheckDeps {
  rejudge?: RejudgeDeps;
  compare?: CompareDeps;
}

/**
 * Re-judge with the missing LLM judges, then report Jev against them.
 *
 * @param argv - Command-line arguments (without node and script path)
 * @param deps - Test seams
 * @returns Promise resolving once the report is printed
 */
export async function runRecheck(
  argv: string[],
  deps: RecheckDeps = {},
): Promise<void> {
  const args = parseRecheckArgs(argv);
  const where = [`--results-dir=${args.resultsDir}`, ...args.runIds];

  for (const judge of args.judges) {
    await runRejudge(
      [...where, "-j", judge, ...(args.dryRun ? ["--dry-run"] : [])],
      deps.rejudge,
    );
  }

  if (args.dryRun) {
    return;
  }

  const slugs = new Set(args.judges.map(judgeSlug));

  for (const runId of args.runIds) {
    for (const slug of await judgeFolders(args.resultsDir, runId)) {
      slugs.add(slug);
    }
  }

  await runJevCompare(
    [...where, "--recorded", ...[...slugs].map((s) => `--reference=${s}`)],
    deps.compare,
  );
}

/**
 * List the judges that have sidecars in a run.
 *
 * @param resultsDir - The results directory
 * @param runId - A run id
 * @returns Judge slugs (none when the run has no judges folder)
 */
async function judgeFolders(
  resultsDir: string,
  runId: string,
): Promise<string[]> {
  try {
    const entries = await readdir(join(resultsDir, runId, SIDECAR_DIR), {
      withFileTypes: true,
    });

    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Parse command-line arguments.
 *
 * @param argv - Arguments
 * @returns Run ids, judges, results directory and dry-run flag
 * @throws When no run is given
 */
export function parseRecheckArgs(argv: string[]): RecheckArgs {
  const flag = (name: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const runs = argv.filter((a) => !a.startsWith("--"));

  if (runs.length === 0) {
    throw new Error("Give the run directory (or run id) to check");
  }

  // A run directory path carries its results directory with it.
  const fromPath = runs.some((r) => r.includes("/"))
    ? dirname(resolve(runs[0] as string))
    : undefined;
  const judges = flag("judges")
    ?.split(",")
    .map((j) => j.trim())
    .filter((j) => j !== "");

  return {
    runIds: runs.map((r) => basename(r)),
    judges: judges != null && judges.length > 0 ? judges : DEFAULT_JUDGES,
    resultsDir: flag("results-dir") ?? fromPath ?? RESULTS_DIR,
    dryRun: argv.includes("--dry-run"),
  };
}

if (import.meta.main) {
  await runRecheck(process.argv.slice(2));
}
