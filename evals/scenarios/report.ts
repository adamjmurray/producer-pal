#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * CLI for viewing and comparing eval results from JSON files
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { styleText } from "node:util";
import { Command } from "commander";
import {
  type JsonEvalResult,
  RESULTS_DIR,
} from "./helpers/json-results/types.ts";
import { printResult } from "./helpers/reporting/result-printer.ts";

const program = new Command();

program
  .name("eval-report")
  .description("View and compare eval results")
  .argument("[paths...]", "JSON result file(s) or scenario directories")
  .option("--run <runId>", "Show all scenarios from a specific run")
  .option("--compare <runIds...>", "Compare two or more runs")
  .action(async (paths: string[], options: ReportOptions) => {
    if (options.compare) {
      await compareRuns(options.compare);
    } else if (options.run) {
      await showRun(options.run);
    } else if (paths.length > 0) {
      await showPaths(paths);
    } else {
      await showLatest();
    }
  });

program.parse();

interface ReportOptions {
  run?: string;
  compare?: string[];
}

/**
 * Load a JsonEvalResult from a file path
 *
 * @param filePath - Path to JSON result file
 * @returns Parsed result
 */
async function loadResult(filePath: string): Promise<JsonEvalResult> {
  const text = await readFile(filePath, "utf-8");

  return JSON.parse(text) as JsonEvalResult;
}

/**
 * Find all result files in a run directory
 *
 * @param runId - Run identifier (directory name)
 * @returns Array of file paths
 */
async function findResultsByRunId(runId: string): Promise<string[]> {
  const runDir = join(RESULTS_DIR, runId);

  return await findResultsInDir(runDir);
}

/**
 * Find all result files in a directory, sorted newest first
 *
 * @param dir - Directory to scan
 * @returns Array of file paths
 */
async function findResultsInDir(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);

    return files
      .filter((f) => f.endsWith(".json"))
      .toSorted()
      .toReversed()
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

/**
 * Show results from explicit paths (files or directories)
 *
 * @param paths - File or directory paths
 */
async function showPaths(paths: string[]): Promise<void> {
  for (const path of paths) {
    if (path.endsWith(".json")) {
      const result = await loadResult(path);

      printResult(result);
    } else {
      const files = await findResultsInDir(path);

      for (const file of files) {
        const result = await loadResult(file);

        printResult(result);
      }
    }
  }
}

/**
 * Show all scenarios from a specific run
 *
 * @param runId - Run identifier
 */
async function showRun(runId: string): Promise<void> {
  const files = await findResultsByRunId(runId);

  if (files.length === 0) {
    console.error(`No results found for run: ${runId}`);
    process.exit(1);
  }

  console.log(styleText("bold", `Eval Run: ${runId}\n`));

  for (const file of files) {
    const result = await loadResult(file);

    printResult(result);
  }
}

/**
 * Show all results from the latest run
 *
 */
async function showLatest(): Promise<void> {
  try {
    const runDirs = await readdir(RESULTS_DIR);
    const sorted = runDirs.toSorted().toReversed();

    for (const dir of sorted) {
      const files = await findResultsInDir(join(RESULTS_DIR, dir));

      if (files.length > 0) {
        console.log(styleText("bold", `Latest run: ${dir}\n`));

        for (const file of files) {
          const result = await loadResult(file);

          printResult(result);
        }

        return;
      }
    }

    console.log("No eval results found. Run evaluations first.");
  } catch {
    console.log("No eval results found. Run evaluations first.");
  }
}

/**
 * Compare two or more runs side by side.
 *
 * Trial-aware: a run made with `-r N` writes one file per trial, so each cell
 * tallies how many of a scenario's trials passed. Collapsing them to a single
 * result would let the last file read win and hide flakiness, which is the
 * main thing a comparison is looking for.
 *
 * @param runIds - Run identifiers to compare
 */
async function compareRuns(runIds: string[]): Promise<void> {
  const runResults = new Map<string, Map<string, JsonEvalResult[]>>();

  for (const runId of runIds) {
    const files = await findResultsByRunId(runId);
    const byScenario = new Map<string, JsonEvalResult[]>();

    for (const file of files) {
      const result = await loadResult(file);
      const trials = byScenario.get(result.scenarioId) ?? [];

      trials.push(result);
      byScenario.set(result.scenarioId, trials);
    }

    runResults.set(runId, byScenario);
  }

  const scenarioIds = new Set<string>();

  for (const byScenario of runResults.values()) {
    for (const id of byScenario.keys()) {
      scenarioIds.add(id);
    }
  }

  if (scenarioIds.size === 0) {
    console.error("No results found for the specified runs.");
    process.exit(1);
  }

  console.log(styleText("bold", `Comparing: ${runIds.join(" → ")}\n`));

  for (const scenarioId of [...scenarioIds].toSorted()) {
    const cells = runIds.map((runId) =>
      formatRunCell(runResults.get(runId)?.get(scenarioId)),
    );
    const tag = changeTag(runResults, runIds, scenarioId);

    if (tag) {
      cells.push(tag);
    }

    console.log(`  ${scenarioId.padEnd(35)} ${cells.join("  →  ")}`);
  }
}

/**
 * Count how many of a scenario's trials passed.
 *
 * @param trials - Every stored trial for one scenario in one run
 * @returns Passed and total counts, or null when the cell has no gradable runs
 */
function passRate(
  trials: JsonEvalResult[] | undefined,
): { passed: number; total: number } | null {
  if (!trials || trials.length === 0) {
    return null;
  }

  const graded = trials.filter((t) => t.result !== "skipped");

  if (graded.length === 0) {
    return null;
  }

  return {
    passed: graded.filter((t) => t.result === "pass").length,
    total: graded.length,
  };
}

/**
 * Format a single cell in the comparison table.
 *
 * A mixed cell gets its own marker: a scenario that passes 2 of 3 trials is a
 * different problem from one that fails outright, and the icon is what makes
 * that visible at a glance.
 *
 * @param trials - Every stored trial for one scenario in one run
 * @returns Styled cell string
 */
function formatRunCell(trials: JsonEvalResult[] | undefined): string {
  if (!trials || trials.length === 0) {
    return styleText("gray", "—");
  }

  const rate = passRate(trials);

  if (!rate) {
    return styleText("gray", "skip");
  }

  const { passed, total } = rate;
  const label = `${passed}/${total}`;

  if (passed === total) {
    return styleText("green", `✓ ${label}`);
  }

  if (passed === 0) {
    return styleText("red", `✗ ${label}`);
  }

  return styleText("yellow", `~ ${label}`);
}

/**
 * Describe how the last two runs differ for one scenario.
 *
 * Compares pass RATES, not a single pass/fail, so a drop from 3/3 to 2/3 shows
 * up instead of being rounded away. Losing every passing trial is called out
 * separately from losing some — the first is a regression, the second is
 * usually flakiness.
 *
 * @param runResults - All run results
 * @param runIds - Ordered run IDs
 * @param scenarioId - Scenario to check
 * @returns Styled tag string, or undefined if nothing changed
 */
function changeTag(
  runResults: Map<string, Map<string, JsonEvalResult[]>>,
  runIds: string[],
  scenarioId: string,
): string | undefined {
  if (runIds.length < 2) {
    return undefined;
  }

  const prev = passRate(
    runResults.get(runIds.at(-2) as string)?.get(scenarioId),
  );
  const curr = passRate(
    runResults.get(runIds.at(-1) as string)?.get(scenarioId),
  );

  if (!prev || !curr) {
    return undefined;
  }

  const before = prev.passed / prev.total;
  const after = curr.passed / curr.total;

  if (before > 0 && after === 0) {
    return styleText("red", "← REGRESSION");
  }

  if (before === 0 && after > 0) {
    return styleText("green", "← FIXED");
  }

  if (after < before) {
    return styleText("yellow", "← WORSE");
  }

  if (after > before) {
    return styleText("green", "← BETTER");
  }

  return undefined;
}
