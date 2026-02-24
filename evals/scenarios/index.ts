#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * CLI for running Producer Pal evaluation scenarios
 */

import { Command } from "commander";
import {
  parseModelArg,
  type ModelSpec,
} from "#evals/shared/parse-model-arg.ts";
import { loadConfigProfiles, listConfigProfileIds } from "./config-profiles.ts";
import { setQuietMode } from "./helpers/output-config.ts";
import {
  printResultsTable,
  type ResultsByScenario,
} from "./helpers/report-table.ts";
import { printResult } from "./helpers/result-printer.ts";
import { loadScenarios, listScenarioIds } from "./load-scenarios.ts";
import { runScenario } from "./run-scenario.ts";
import { type ConfigProfile, type EvalScenarioResult } from "./types.ts";

export type { ModelSpec, ModelSpec as JudgeOverride };

interface CliOptions {
  test: string[];
  model: string[];
  config: string[];
  judge?: string;
  list?: boolean;
  all?: boolean;
  skipSetup?: boolean;
  quiet?: boolean;
}

/**
 * Collector function for multiple flag values
 *
 * @param value - Current flag value
 * @param previous - Previously collected values
 * @returns Updated array of values
 */
function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const program = new Command();

program
  .name("eval")
  .description("Run Producer Pal evaluation scenarios against Ableton Live")
  .showHelpAfterError(true)
  .option(
    "-t, --test <id>",
    "Run specific scenario(s) by ID",
    collectValues,
    [],
  )
  .option(
    "-m, --model <provider/model>",
    "Model(s) to test (e.g., gemini-2.0-flash, anthropic/claude-sonnet-4-5)",
    collectValues,
    [],
  )
  .option(
    "-c, --config <profile-id>",
    "Config profile(s) to test (default: 'default')",
    collectValues,
    [],
  )
  .option(
    "-j, --judge <provider/model>",
    "Override judge LLM (e.g., google/gemini-2.0-flash)",
  )
  .option("-l, --list", "List available scenarios and config profiles")
  .option(
    "-s, --skip-setup",
    "Skip Live Set setup (use existing MCP connection)",
  )
  .option("-q, --quiet", "Suppress detailed AI and judge responses")
  .option("-a, --all", "Run all scenarios")
  .action(async (options: CliOptions) => {
    if (options.list) {
      printList();

      return;
    }

    await runEvaluation(options);
  });

program.parse();

/**
 * Print available scenarios and config profiles
 */
function printList(): void {
  console.log("Available scenarios:");

  for (const id of listScenarioIds()) {
    console.log(`  - ${id}`);
  }

  console.log("\nAvailable config profiles:");

  for (const id of listConfigProfileIds()) {
    console.log(`  - ${id}`);
  }
}

/**
 * Run the evaluation with given options
 *
 * @param options - CLI options
 */
async function runEvaluation(options: CliOptions): Promise<void> {
  setQuietMode(options.quiet ?? false);

  if (options.model.length === 0) {
    program.error("-m, --model is required when running tests");
  }

  if (!options.all && options.test.length === 0) {
    program.error("must specify -t, --test <id> or -a, --all");
  }

  if (options.all && options.test.length > 0) {
    program.error("--all and --test cannot be used together");
  }

  try {
    const modelSpecs = options.model.map(parseModelArg);
    const configProfiles = loadConfigProfiles(
      options.config.length > 0 ? options.config : undefined,
    );

    const scenarios = loadScenarios({
      testIds: options.all ? undefined : options.test,
    });

    if (scenarios.length === 0) {
      console.error("No scenarios to run.");
      process.exit(1);
    }

    const judgeOverride = options.judge
      ? parseModelArg(options.judge)
      : undefined;

    const totalRuns =
      scenarios.length * modelSpecs.length * configProfiles.length;

    console.log(
      `Running ${scenarios.length} scenario(s) × ${modelSpecs.length} model(s)` +
        ` × ${configProfiles.length} config(s) = ${totalRuns} run(s)...`,
    );

    // Results: scenarioId → modelKey → configId → result
    const resultsByScenario: ResultsByScenario = new Map();

    for (const scenario of scenarios) {
      const modelResults = new Map<string, Map<string, EvalScenarioResult>>();
      let liveSetOpened = false;

      for (const spec of modelSpecs) {
        const modelKey = `${spec.provider}/${spec.model}`;
        const configResults = new Map<string, EvalScenarioResult>();

        for (const profile of configProfiles) {
          const result = await runScenario(scenario, {
            provider: spec.provider,
            model: spec.model,
            skipLiveSetOpen: options.skipSetup ?? liveSetOpened,
            judgeOverride,
            configProfile: profile,
          });

          liveSetOpened = true;
          configResults.set(profile.id, result);
          printResult(result, modelKey, profile.id);
        }

        modelResults.set(modelKey, configResults);
      }

      resultsByScenario.set(scenario.id, modelResults);
    }

    printSummary(resultsByScenario, modelSpecs, configProfiles);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

/**
 * Print summary of all results
 *
 * @param resultsByScenario - 3D results map
 * @param modelSpecs - All model specs tested
 * @param configProfiles - All config profiles tested
 */
function printSummary(
  resultsByScenario: ResultsByScenario,
  modelSpecs: ModelSpec[],
  configProfiles: ConfigProfile[],
): void {
  // Use table for multi-model or multi-config runs
  if (modelSpecs.length > 1 || configProfiles.length > 1) {
    printResultsTable(resultsByScenario, modelSpecs, configProfiles);

    return;
  }

  // Single model + single config - use simple summary
  const allResults = [...resultsByScenario.values()].flatMap((modelMap) =>
    [...modelMap.values()].flatMap((configMap) => [...configMap.values()]),
  );

  console.log("\n" + "=".repeat(50));
  console.log("Summary:");

  for (const result of allResults) {
    const pct =
      result.maxScore > 0
        ? ((result.earnedScore / result.maxScore) * 100).toFixed(0)
        : "100";

    console.log(
      `  ${result.scenario.id}: ${formatScore(result.earnedScore)}/${result.maxScore} (${pct}%)`,
    );

    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
  }
}

/**
 * Format a score for display (integer if whole, 1 decimal otherwise)
 *
 * @param score - The score to format
 * @returns Formatted score string
 */
function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
