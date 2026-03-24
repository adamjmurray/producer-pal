#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * CLI for running Producer Pal evaluation scenarios
 */

import { styleText } from "node:util";
import { Command } from "commander";
import { collapseStdoutNewlines } from "#evals/chat/shared/collapse-stdout-newlines.ts";
import { efficiencyColor, orange } from "#evals/chat/shared/formatting.ts";
import {
  parseModelArg,
  type ModelSpec,
} from "#evals/shared/parse-model-arg.ts";
import { GEMINI_CONFIG } from "#evals/shared/provider-configs.ts";
import { loadConfigProfiles, listConfigProfileIds } from "./config-profiles.ts";
import { toJsonResult } from "./helpers/json-results/converter.ts";
import { generateRunId } from "./helpers/json-results/run-id.ts";
import { type JsonEvalResult } from "./helpers/json-results/types.ts";
import { writeJsonResult } from "./helpers/json-results/writer.ts";
import { setQuietMode } from "./helpers/output-config.ts";
import {
  printResultsTable,
  type ResultsByScenario,
} from "./helpers/report-table.ts";
import { printResultBlock } from "./helpers/result-printer.ts";
import { loadScenarios, listScenarioSummaries } from "./load-scenarios.ts";
import { runScenario } from "./run-scenario.ts";
import { type ConfigProfile } from "./types.ts";

collapseStdoutNewlines();

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
  usage?: boolean;
  defaultInstructions?: boolean;
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
    "Model(s) to test (e.g., gemini-3-flash-preview, local/qwen3-8b)",
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
    `Override judge LLM (default: google/${GEMINI_CONFIG.defaultModel})`,
  )
  .option("-l, --list", "List available scenarios and config profiles")
  .option(
    "-s, --skip-setup",
    "Skip Live Set setup (use existing MCP connection)",
  )
  .option("-q, --quiet", "Suppress detailed AI and judge responses")
  .option("-u, --usage", "Show per-step token usage")
  .option("-I, --default-instructions", "Use default system instructions")
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

  for (const { id, kind } of listScenarioSummaries()) {
    const kindLabel = styleText("gray", `[${kind}]`);

    console.log(`  - ${id} ${kindLabel}`);
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

    const judgeOverride = parseModelArg(
      options.judge ?? GEMINI_CONFIG.defaultModel,
    );

    const totalRuns =
      scenarios.length * modelSpecs.length * configProfiles.length;

    console.log(
      styleText(
        "bold",
        `Running ${scenarios.length} scenario(s) × ${modelSpecs.length} model(s)` +
          ` × ${configProfiles.length} config(s) = ${totalRuns} run(s)...`,
      ),
    );

    // Results: scenarioId → modelKey → configId → result
    const resultsByScenario: ResultsByScenario = new Map();
    const runId = generateRunId();

    for (const scenario of scenarios) {
      const modelResults = new Map<string, Map<string, JsonEvalResult>>();
      let liveSetOpened = false;

      for (const spec of modelSpecs) {
        const modelKey = `${spec.provider}/${spec.model}`;
        const configResults = new Map<string, JsonEvalResult>();

        for (const profile of configProfiles) {
          const scenarioResult = await runScenario(scenario, {
            provider: spec.provider,
            model: spec.model,
            skipLiveSetOpen: options.skipSetup ?? liveSetOpened,
            judgeOverride,
            configProfile: profile,
            usage: options.usage,
            defaultInstructions: options.defaultInstructions,
          });

          liveSetOpened = true;

          const jsonResult = toJsonResult(
            scenarioResult,
            runId,
            modelKey,
            profile.id,
          );

          await writeJsonResult(jsonResult);
          printResultBlock(jsonResult);
          configResults.set(profile.id, jsonResult);
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

  const modelLabel = modelSpecs[0]
    ? modelSpecs[0].model
      ? `${modelSpecs[0].provider}/${modelSpecs[0].model}`
      : modelSpecs[0].provider
    : "";

  console.log("\n" + orange("=".repeat(50)));
  console.log(styleText("bold", `Summary: ${modelLabel}`) + "\n");

  let passCount = 0;
  let failCount = 0;

  for (const result of allResults) {
    if (result.result === "pass") passCount++;
    else failCount++;

    console.log("  " + formatSummaryLine(result));

    if (result.error) {
      console.log("    " + styleText("red", "Error: " + result.error));
    }
  }

  const totalScenarios = allResults.length;

  console.log(
    `\n  ${totalScenarios} scenarios: ${passCount} pass, ${failCount} fail`,
  );
}

/**
 * Format a single scenario line for the multi-scenario summary
 *
 * @param result - Scenario result
 * @returns Formatted summary line
 */
function formatSummaryLine(result: JsonEvalResult): string {
  const { checks } = result;
  const passed = checks.results.filter((c) => c.pass).length;
  const total = checks.results.length;
  const checksColor = checks.pass ? "green" : "red";

  const parts = ["checks " + styleText(checksColor, `${passed}/${total}`)];

  if (result.efficiency) {
    const effColor = efficiencyColor(result.efficiency.percentage);

    parts.push(
      "efficiency " + styleText(effColor, `${result.efficiency.percentage}%`),
    );
  }

  if (result.judge) {
    const judgeColor = result.judge.pass ? "green" : "red";
    const judgeText = result.judge.pass ? "pass" : "fail";
    const issueSuffix =
      result.judge.issues.length > 0
        ? ` (${result.judge.issues.length} issue(s))`
        : "";

    parts.push("judge " + styleText(judgeColor, judgeText + issueSuffix));
  }

  const overallColor = result.result === "pass" ? "green" : "red";
  const id = styleText(overallColor, result.scenarioId + ":");

  return `${id} ${parts.join(" | ")}`;
}
