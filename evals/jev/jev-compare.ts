#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Offline probe: re-judge saved eval results with Jev and measure how often it
 * agrees with the stored judge verdict stored in each result. No Ableton
 * needed.
 *
 * Run: node --env-file=.env evals/jev/jev-compare.ts [run-ids...] [flags]
 *   run-ids: run directories under evals/results (default: all)
 *   flags:   --scenario=id   only this scenario (repeatable)
 *            --limit=N       compare at most N results
 *            --concurrency=N parallel Jev calls (default 4)
 *            --include-stale also use results recorded before the scenario's
 *                            judge criteria last changed
 *
 * The full per-result report goes to evals/results/jev-compare-<time>.json.
 */

import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { RESULTS_DIR } from "#evals/scenarios/helpers/json-results/types.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { jevJudge } from "./jev-judge.ts";
import { formatReport, type CompareEntry } from "./jev-report.ts";
import { loadJudgedResults, type JudgedResult } from "./jev-results.ts";

const DEFAULT_CONCURRENCY = 4;

interface CliArgs {
  runIds?: string[];
  scenarioIds: string[];
  limit?: number;
  concurrency: number;
  includeStale: boolean;
}

/**
 * Run the comparison and print the report.
 *
 * @param argv - Command-line arguments (without node and script path)
 * @returns Promise resolving once the report is printed and saved
 */
export async function runJevCompare(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const { items, skipped } = await loadJudgedResults({
    runIds: args.runIds,
    scenarioIds: args.scenarioIds.length > 0 ? args.scenarioIds : undefined,
    includeStale: args.includeStale,
  });
  const selected = args.limit == null ? items : items.slice(0, args.limit);

  console.log(
    `Judging ${selected.length} of ${items.length} saved result(s) with Jev...`,
  );

  const entries = await mapConcurrent(selected, args.concurrency, compareOne);
  const lines = formatReport(entries, skipped);

  console.log(`\n${lines.join("\n")}`);

  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const path = join(RESULTS_DIR, `jev-compare-${stamp}.json`);

  await writeFile(path, JSON.stringify({ skipped, entries }, null, 2) + "\n");
  console.log(`\nFull report: ${path}`);
}

/**
 * Re-judge one saved result. A Jev failure is recorded, not thrown.
 *
 * @param item - The saved result and its criteria
 * @returns The comparison entry
 */
async function compareOne(item: JudgedResult): Promise<CompareEntry> {
  const { result, file, criteria } = item;
  const judge = {
    pass: result.judge?.pass ?? false,
    issues: result.judge?.issues ?? [],
    advisory: result.judge?.advisory,
    provider: result.judge?.provider,
    model: result.judge?.model,
  };
  const base = {
    file,
    scenarioId: result.scenarioId,
    judge,
    checksPass: result.checks.pass,
  };

  try {
    const jev = await jevJudge(
      { turns: result.turns, checks: result.checks.results },
      criteria,
    );

    return { ...base, jev };
  } catch (error) {
    return { ...base, error: errorMessage(error) };
  }
}

/**
 * Map items with at most `limit` calls in flight, keeping input order.
 *
 * @param items - Inputs
 * @param limit - Max concurrent calls
 * @param fn - Async mapper
 * @returns Outputs in input order
 */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;

      out[i] = await fn(items[i] as T);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, limit) }, () => worker()));

  return out;
}

/**
 * Parse command-line arguments.
 *
 * @param argv - Arguments
 * @returns Parsed options
 */
export function parseArgs(argv: string[]): CliArgs {
  const runIds = argv
    .filter((a) => !a.startsWith("--"))
    .map((a) => basename(a));
  const flag = (name: string): string[] =>
    argv
      .filter((a) => a.startsWith(`--${name}=`))
      .map((a) => a.slice(name.length + 3));

  const num = (name: string): number | undefined => {
    const n = Number(flag(name).at(-1));

    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
  };

  return {
    runIds: runIds.length > 0 ? runIds : undefined,
    scenarioIds: flag("scenario"),
    limit: num("limit"),
    concurrency: num("concurrency") ?? DEFAULT_CONCURRENCY,
    includeStale: argv.includes("--include-stale"),
  };
}

if (import.meta.main) {
  await runJevCompare(process.argv.slice(2));
}
