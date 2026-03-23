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
import { printResult } from "./helpers/result-printer.ts";

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
 * Find all result files matching a run ID across all scenarios
 *
 * @param runId - Run identifier to match
 * @returns Array of file paths
 */
async function findResultsByRunId(runId: string): Promise<string[]> {
  const paths: string[] = [];

  try {
    const scenarioDirs = await readdir(RESULTS_DIR);

    for (const dir of scenarioDirs) {
      const filePath = join(RESULTS_DIR, dir, `${runId}.json`);

      try {
        await readFile(filePath);
        paths.push(filePath);
      } catch {
        // File doesn't exist for this scenario
      }
    }
  } catch {
    // Results directory doesn't exist
  }

  return paths;
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
      .sort()
      .reverse()
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
 * Show the latest result for each scenario
 *
 */
async function showLatest(): Promise<void> {
  try {
    const scenarioDirs = await readdir(RESULTS_DIR);
    let found = false;

    for (const dir of scenarioDirs.sort()) {
      const files = await findResultsInDir(join(RESULTS_DIR, dir));

      if (files.length > 0) {
        found = true;

        const result = await loadResult(files[0] as string);

        printResult(result);
      }
    }

    if (!found) {
      console.log("No eval results found. Run evaluations first.");
    }
  } catch {
    console.log("No eval results found. Run evaluations first.");
  }
}

/**
 * Compare two or more runs side by side
 *
 * @param runIds - Run identifiers to compare
 */
async function compareRuns(runIds: string[]): Promise<void> {
  // Load all results grouped by run
  const runResults = new Map<string, Map<string, JsonEvalResult>>();

  for (const runId of runIds) {
    const files = await findResultsByRunId(runId);
    const byScenario = new Map<string, JsonEvalResult>();

    for (const file of files) {
      const result = await loadResult(file);

      byScenario.set(result.scenarioId, result);
    }

    runResults.set(runId, byScenario);
  }

  // Collect all scenario IDs
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

  for (const scenarioId of [...scenarioIds].sort()) {
    const cells = runIds.map((runId) =>
      formatRunCell(runResults, runId, scenarioId),
    );
    const tag = regressionTag(runResults, runIds, scenarioId);

    if (tag) cells.push(tag);

    console.log(`  ${scenarioId.padEnd(35)} ${cells.join("  →  ")}`);
  }
}

/**
 * Format a single cell in the comparison table
 *
 * @param runResults - All run results
 * @param runId - Run to look up
 * @param scenarioId - Scenario to look up
 * @returns Styled cell string
 */
function formatRunCell(
  runResults: Map<string, Map<string, JsonEvalResult>>,
  runId: string,
  scenarioId: string,
): string {
  const result = runResults.get(runId)?.get(scenarioId);

  if (!result) return styleText("gray", "—");

  const icon = result.result === "pass" ? "✓" : "✗";
  const color = result.result === "pass" ? "green" : "red";
  const { checks } = result;
  const passed = checks.results.filter((c) => c.pass).length;
  const total = checks.results.length;

  return styleText(color, `${icon} ${passed}/${total}`);
}

/**
 * Detect regression or fix between the last two runs
 *
 * @param runResults - All run results
 * @param runIds - Ordered run IDs
 * @param scenarioId - Scenario to check
 * @returns Styled tag string, or undefined if no change
 */
function regressionTag(
  runResults: Map<string, Map<string, JsonEvalResult>>,
  runIds: string[],
  scenarioId: string,
): string | undefined {
  if (runIds.length < 2) return undefined;

  const prev = runResults.get(runIds.at(-2) as string)?.get(scenarioId);
  const curr = runResults.get(runIds.at(-1) as string)?.get(scenarioId);

  if (!prev || !curr) return undefined;

  if (prev.result === "pass" && curr.result === "fail") {
    return styleText("red", "← REGRESSION");
  }

  if (prev.result === "fail" && curr.result === "pass") {
    return styleText("green", "← FIXED");
  }

  return undefined;
}
