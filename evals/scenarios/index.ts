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
import { listModels } from "#evals/shared/list-models.ts";
import {
  LIST_MODELS_HINT,
  parseModelArg,
  type ModelSpec,
} from "#evals/shared/parse-model-arg.ts";
import { GEMINI_CONFIG } from "#evals/shared/provider-configs.ts";
import {
  toJsonResult,
  type TrialInfo,
} from "./helpers/json-results/converter.ts";
import { generateRunId } from "./helpers/json-results/run-id.ts";
import {
  buildSkippedResult,
  shouldSkipScenario,
} from "./helpers/json-results/skip-scenario.ts";
import { type JsonEvalResult } from "./helpers/json-results/types.ts";
import { writeJsonResult } from "./helpers/json-results/writer.ts";
import { setQuietMode } from "./helpers/output-config.ts";
import { type ResultsByScenario } from "./helpers/report-table.ts";
import { printResultBlock } from "./helpers/result-printer.ts";
import { printSummary } from "./helpers/summary-printer.ts";
import {
  parseRepeatCount,
  printTrialSummary,
} from "./helpers/trial-helpers.ts";
import { loadScenarios, printList } from "./load-scenarios.ts";
import { buildRunEnv, envLabel, type RunEnv } from "./run-env/run-env.ts";
import { runScenario } from "./run-scenario.ts";

collapseStdoutNewlines();

export type { ModelSpec, ModelSpec as JudgeOverride };

interface CliOptions {
  test: string[];
  model: string[];
  /** Enable small-model mode (basic skills tier + reduced param schemas). */
  smallModel?: boolean;
  /** Use JSON tool-result output (default: compact, the product default). */
  json?: boolean;
  /** Comma-separated tool subset (short or full names; default: all standard). */
  tools?: string;
  /** Enable the opt-in Direct Live API tool on top of the toolset. */
  liveApi?: boolean;
  judge?: string;
  repeat?: string;
  list?: boolean;
  listModels?: string | boolean;
  all?: boolean;
  skipSetup?: boolean;
  skipJudge?: boolean;
  quiet?: boolean;
  usage?: boolean;
  /** Whether to write JSON result files to disk (--no-save sets false). */
  save?: boolean;
  baseUrl?: string;
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
    "Model(s) to test (e.g., gemini-3.5-flash, local/qwen3-8b)",
    collectValues,
    [],
  )
  .option(
    "--small-model",
    "Enable small-model mode (basic skills + reduced param schemas)",
  )
  .option(
    "--json",
    "Use JSON tool-result output (default: compact, the product default)",
  )
  .option(
    "--tools <list>",
    "Comma-separated tool subset, short or full names (default: all standard tools)",
  )
  .option(
    "--live-api",
    "Enable the Direct Live API tool (ppal-live-api) on top of the toolset",
  )
  .option(
    "-j, --judge <provider/model>",
    `Override judge LLM (default: google/${GEMINI_CONFIG.defaultModel})`,
  )
  .option(
    "-r, --repeat <N>",
    "Run each scenario N times to detect flaky results",
  )
  .option("-l, --list", "List available scenarios")
  .option(
    "--list-models [provider]",
    "List models for a provider (omit to list providers), then exit",
  )
  .option(
    "-s, --skip-setup",
    "Skip Live Set setup (use existing MCP connection)",
  )
  .option(
    "--skip-judge",
    "Skip the LLM-as-judge step (rely on deterministic checks only)",
  )
  .option("-q, --quiet", "Suppress detailed AI and judge responses")
  .option("-u, --usage", "Show per-step token usage")
  .option("--no-save", "Skip writing JSON result files to disk")
  .option("-a, --all", "Run all scenarios")
  .option(
    "-b, --base-url <url>",
    "Base URL for local provider (default: http://localhost:11434/v1)",
  )
  .action(async (options: CliOptions) => {
    // Apply --base-url to env so the local provider picks it up
    if (options.baseUrl) {
      process.env.LOCAL_BASE_URL = options.baseUrl;
    }

    if (options.listModels != null) {
      process.exit(
        await listModels(options.listModels, { baseUrl: options.baseUrl }),
      );
    }

    if (options.list) {
      printList();

      return;
    }

    await runEvaluation(options);
  });

program.parse();

/**
 * Run the evaluation with given options
 *
 * @param options - CLI options
 */
async function runEvaluation(options: CliOptions): Promise<void> {
  setQuietMode(options.quiet ?? false);

  if (options.model.length === 0) {
    program.error(
      `-m, --model is required when running tests. ${LIST_MODELS_HINT}`,
    );
  }

  if (!options.all && options.test.length === 0) {
    program.error("must specify -t, --test <id> or -a, --all");
  }

  if (options.all && options.test.length > 0) {
    program.error("--all and --test cannot be used together");
  }

  let modelSpecs: ModelSpec[];
  let judgeOverride: ModelSpec;

  try {
    modelSpecs = options.model.map(parseModelArg);
    judgeOverride = parseModelArg(options.judge ?? GEMINI_CONFIG.defaultModel);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    program.error(`${message} ${LIST_MODELS_HINT}`);

    return;
  }

  let runEnv: RunEnv;

  try {
    runEnv = buildRunEnv(options);
  } catch (error) {
    program.error(error instanceof Error ? error.message : String(error));

    return;
  }

  const label = envLabel(runEnv);

  try {
    const scenarios = loadScenarios({
      testIds: options.all ? undefined : options.test,
    });

    if (scenarios.length === 0) {
      console.error("No scenarios to run.");
      process.exit(1);
    }

    const repeatCount = parseRepeatCount(options.repeat);
    const totalRuns = scenarios.length * modelSpecs.length * repeatCount;
    const repeatLabel = repeatCount > 1 ? ` × ${repeatCount} trial(s)` : "";

    console.log(
      styleText(
        "bold",
        `Running ${scenarios.length} scenario(s) × ${modelSpecs.length} model(s)` +
          `${repeatLabel} = ${totalRuns} run(s)...`,
      ),
    );

    if (label !== "default") {
      console.log(styleText("gray", `Environment: ${label}`));
    }

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
      runEnv,
      label,
      runCtx,
    );

    printSummary(resultsByScenario, modelSpecs, label);
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
 * Run all scenarios across models in the active run environment, collecting
 * results. The result map keeps its 3-level shape (scenario → model → label)
 * for the reporting layer; with a single run environment the innermost map has
 * exactly one entry, keyed by `label`.
 *
 * @param scenarios - Scenarios to run
 * @param modelSpecs - Models to test
 * @param runEnv - The active run environment
 * @param label - The run-environment label (see `envLabel`)
 * @param ctx - Shared run context
 * @returns 3D results map
 */
async function runAllScenarios(
  scenarios: ReturnType<typeof loadScenarios>,
  modelSpecs: ModelSpec[],
  runEnv: RunEnv,
  label: string,
  ctx: RunContext,
): Promise<ResultsByScenario> {
  const resultsByScenario: ResultsByScenario = new Map();

  for (const scenario of scenarios) {
    const modelResults = new Map<string, Map<string, JsonEvalResult[]>>();
    // The skip decision depends only on the scenario + run env, so it is the
    // same for every model.
    const skipReason = shouldSkipScenario(scenario, runEnv);
    let liveSetOpened = false;

    for (const spec of modelSpecs) {
      const modelKey = `${spec.provider}/${spec.model}`;
      let results: JsonEvalResult[];

      if (skipReason != null) {
        // Skipped before running: no Live Set is opened, so leave
        // `liveSetOpened` untouched for the next model.
        results = await emitSkipped(scenario, modelKey, label, skipReason, ctx);
      } else {
        results = await runTrials(
          scenario,
          spec,
          runEnv,
          label,
          ctx,
          liveSetOpened,
        );
        liveSetOpened = true;
      }

      modelResults.set(modelKey, new Map([[label, results]]));
    }

    resultsByScenario.set(scenario.id, modelResults);
  }

  return resultsByScenario;
}

/**
 * Emit a skipped result for a (scenario, model) combination: persist it (unless
 * --no-save), print it, and return it as a single-element result list.
 *
 * @param scenario - The skipped scenario
 * @param modelKey - Model key (e.g. "google/gemini-3.5-flash")
 * @param label - Run-environment label (see `envLabel`)
 * @param reason - Why the scenario was skipped
 * @param ctx - Shared run context
 * @returns Single-element array with the skipped result
 */
async function emitSkipped(
  scenario: ReturnType<typeof loadScenarios>[number],
  modelKey: string,
  label: string,
  reason: string,
  ctx: RunContext,
): Promise<JsonEvalResult[]> {
  const skipped = buildSkippedResult(
    scenario,
    ctx.runId,
    modelKey,
    label,
    reason,
  );

  if (ctx.options.save !== false) await writeJsonResult(skipped);
  printResultBlock(skipped);

  return [skipped];
}

/**
 * Run N trials for a single (scenario, model) combination in the run environment
 *
 * @param scenario - Scenario to run
 * @param spec - Model spec
 * @param runEnv - The active run environment
 * @param label - Run-environment label (see `envLabel`)
 * @param ctx - Shared run context
 * @param liveSetAlreadyOpened - Whether the Live Set is already open
 * @returns Array of JSON results (one per trial)
 */
async function runTrials(
  scenario: ReturnType<typeof loadScenarios>[number],
  spec: ModelSpec,
  runEnv: RunEnv,
  label: string,
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
      runEnv,
      envLabel: label,
      usage: options.usage,
      skipJudge: options.skipJudge,
    });

    const trialInfo: TrialInfo | undefined =
      repeatCount > 1 ? { trial, totalTrials: repeatCount } : undefined;

    const jsonResult = toJsonResult(
      scenarioResult,
      runId,
      modelKey,
      label,
      trialInfo,
    );

    if (ctx.options.save !== false) await writeJsonResult(jsonResult);
    printResultBlock(jsonResult);
    results.push(jsonResult);
  }

  if (repeatCount > 1) {
    printTrialSummary(results);
  }

  return results;
}
