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
import {
  toJsonResult,
  type TrialInfo,
} from "./helpers/json-results/converter.ts";
import { generateRunId } from "./helpers/json-results/run-id.ts";
import { type JsonEvalResult } from "./helpers/json-results/types.ts";
import { writeJsonResult } from "./helpers/json-results/writer.ts";
import { setQuietMode } from "./helpers/output-config.ts";
import {
  printResultsTable,
  type ResultsByScenario,
} from "./helpers/report-table.ts";
import { printResultBlock } from "./helpers/result-printer.ts";
import {
  buildMultiTrialParts,
  formatParts,
  parseRepeatCount,
  printTrialSummary,
} from "./helpers/trial-helpers.ts";
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
  repeat?: string;
  list?: boolean;
  all?: boolean;
  skipSetup?: boolean;
  quiet?: boolean;
  usage?: boolean;
  json?: boolean;
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
  .option(
    "-r, --repeat <N>",
    "Run each scenario N times to detect flaky results",
  )
  .option("-l, --list", "List available scenarios and config profiles")
  .option(
    "-s, --skip-setup",
    "Skip Live Set setup (use existing MCP connection)",
  )
  .option("-q, --quiet", "Suppress detailed AI and judge responses")
  .option("-u, --usage", "Show per-step token usage")
  .option("--no-json", "Skip writing JSON result files to disk")
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

    const repeatCount = parseRepeatCount(options.repeat);
    const totalRuns =
      scenarios.length *
      modelSpecs.length *
      configProfiles.length *
      repeatCount;
    const repeatLabel = repeatCount > 1 ? ` × ${repeatCount} trial(s)` : "";

    console.log(
      styleText(
        "bold",
        `Running ${scenarios.length} scenario(s) × ${modelSpecs.length} model(s)` +
          ` × ${configProfiles.length} config(s)${repeatLabel} = ${totalRuns} run(s)...`,
      ),
    );

    const runId = generateRunId();
    const runCtx: RunContext = {
      runId,
      judgeOverride,
      repeatCount,
      options,
    };

    const resultsByScenario = await runAllScenarios(
      scenarios,
      modelSpecs,
      configProfiles,
      runCtx,
    );

    printSummary(resultsByScenario, modelSpecs, configProfiles);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

/** Shared context for a single eval run */
interface RunContext {
  runId: string;
  judgeOverride: ModelSpec;
  repeatCount: number;
  options: CliOptions;
}

/**
 * Run all scenarios across models and configs, collecting results
 *
 * @param scenarios - Scenarios to run
 * @param modelSpecs - Models to test
 * @param configProfiles - Config profiles to test
 * @param ctx - Shared run context
 * @returns 3D results map
 */
async function runAllScenarios(
  scenarios: ReturnType<typeof loadScenarios>,
  modelSpecs: ModelSpec[],
  configProfiles: ConfigProfile[],
  ctx: RunContext,
): Promise<ResultsByScenario> {
  const resultsByScenario: ResultsByScenario = new Map();

  for (const scenario of scenarios) {
    const modelResults = new Map<string, Map<string, JsonEvalResult[]>>();
    let liveSetOpened = false;

    for (const spec of modelSpecs) {
      const modelKey = `${spec.provider}/${spec.model}`;
      const configResults = new Map<string, JsonEvalResult[]>();

      for (const profile of configProfiles) {
        const trialResults = await runTrials(
          scenario,
          spec,
          profile,
          ctx,
          liveSetOpened,
        );

        liveSetOpened = true;
        configResults.set(profile.id, trialResults);
      }

      modelResults.set(modelKey, configResults);
    }

    resultsByScenario.set(scenario.id, modelResults);
  }

  return resultsByScenario;
}

/**
 * Run N trials for a single (scenario, model, config) combination
 *
 * @param scenario - Scenario to run
 * @param spec - Model spec
 * @param profile - Config profile
 * @param ctx - Shared run context
 * @param liveSetAlreadyOpened - Whether the Live Set is already open
 * @returns Array of JSON results (one per trial)
 */
async function runTrials(
  scenario: ReturnType<typeof loadScenarios>[number],
  spec: ModelSpec,
  profile: ConfigProfile,
  ctx: RunContext,
  liveSetAlreadyOpened: boolean,
): Promise<JsonEvalResult[]> {
  const { runId, judgeOverride, repeatCount, options } = ctx;
  const modelKey = `${spec.provider}/${spec.model}`;
  const results: JsonEvalResult[] = [];

  for (let trial = 1; trial <= repeatCount; trial++) {
    const skipOpen = options.skipSetup ?? (liveSetAlreadyOpened || trial > 1);

    const scenarioResult = await runScenario(scenario, {
      provider: spec.provider,
      model: spec.model,
      skipLiveSetOpen: skipOpen,
      judgeOverride,
      configProfile: profile,
      usage: options.usage,
    });

    const trialInfo: TrialInfo | undefined =
      repeatCount > 1 ? { trial, totalTrials: repeatCount } : undefined;

    const jsonResult = toJsonResult(
      scenarioResult,
      runId,
      modelKey,
      profile.id,
      trialInfo,
    );

    if (ctx.options.json !== false) await writeJsonResult(jsonResult);
    printResultBlock(jsonResult);
    results.push(jsonResult);
  }

  if (repeatCount > 1) {
    printTrialSummary(results);
  }

  return results;
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
  const allResultGroups = [...resultsByScenario.values()].flatMap((modelMap) =>
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

  for (const results of allResultGroups) {
    const passed = results.filter((r) => r.result === "pass").length;

    passCount += passed;
    failCount += results.length - passed;

    // Show summary for the last trial (or only trial)
    const lastResult = results.at(-1) as JsonEvalResult;

    console.log("  " + formatSummaryLine(lastResult, results));

    if (lastResult.error) {
      console.log("    " + styleText("red", "Error: " + lastResult.error));
    }
  }

  const totalRuns = passCount + failCount;

  console.log(`\n  ${totalRuns} run(s): ${passCount} pass, ${failCount} fail`);
}

/**
 * Format a single scenario line for the multi-scenario summary.
 * When multiple trial results are provided, shows trial pass rate.
 *
 * @param result - Scenario result (last trial when repeating)
 * @param allTrials - All trial results for this scenario/model/config
 * @returns Formatted summary line
 */
function formatSummaryLine(
  result: JsonEvalResult,
  allTrials: JsonEvalResult[],
): string {
  // Multi-trial: aggregate stats across all trials
  if (allTrials.length > 1) {
    const statsText = formatParts(buildMultiTrialParts(allTrials));
    const allPassed = allTrials.every((t) => t.result === "pass");
    const overallColor = allPassed ? "green" : "red";

    return `${styleText(overallColor, result.scenarioId + ":")} ${statsText}`;
  }

  // Single trial: show individual check/efficiency/judge details
  return formatSingleTrialLine(result);
}

/**
 * Format a single-trial summary line with detailed check/efficiency/judge info
 *
 * @param result - Single trial result
 * @returns Formatted summary line
 */
function formatSingleTrialLine(result: JsonEvalResult): string {
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
