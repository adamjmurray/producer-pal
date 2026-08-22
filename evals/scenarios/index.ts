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
import "#evals/shared/install-fetch-dispatcher.ts";
import { collapseStdoutNewlines } from "#evals/chat/shared/collapse-stdout-newlines.ts";
import { listModels } from "#evals/shared/list-models.ts";
import {
  LIST_MODELS_HINT,
  type ModelSpec,
  parseModelArgOrExit,
} from "#evals/shared/parse-model-arg.ts";
import { GEMINI_CONFIG } from "#evals/shared/provider-configs.ts";
import { generateRunId } from "./helpers/json-results/run-id.ts";
import { shouldSkipScenario } from "./helpers/json-results/skip-scenario.ts";
import { type JsonEvalResult } from "./helpers/json-results/types.ts";
import { setQuietMode } from "./helpers/output-config.ts";
import { type ResultsByScenario } from "./helpers/reporting/report-table.ts";
import {
  emitSkipped,
  runTrials,
  type RunContext,
} from "./helpers/trials/run-trials.ts";
import { printSummary } from "./helpers/reporting/summary-printer.ts";
import { parseRepeatCount } from "./helpers/trials/trial-helpers.ts";
import { loadScenarios, printList } from "./load-scenarios.ts";
import { buildRunEnv, envLabel, type RunEnv } from "./run-env/run-env.ts";

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
  skipReflection?: boolean;
  /** Whether to seed the opening connect turn (--no-seed-connect sets false). */
  seedConnect?: boolean;
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
    "Model(s) to test (e.g., gemini-3.6-flash, local/qwen3-8b)",
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
  .option(
    "--skip-reflection",
    "Skip the self-reflection turn injected after a deterministic failure",
  )
  .option(
    "--no-seed-connect",
    "Let the model run the opening connect turn instead of seeding it",
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

  const modelSpecs = options.model.map((model) =>
    parseModelArgOrExit(program, model),
  );
  const judgeOverride = parseModelArgOrExit(
    program,
    options.judge ?? GEMINI_CONFIG.defaultModel,
  );

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
  // The Live Set left open by the previous scenario. A `reuseLiveSet` scenario
  // that wants the same one runs against it instead of paying another open.
  let lastOpenedLiveSet: string | null = null;

  for (const scenario of scenarios) {
    const modelResults = new Map<string, Map<string, JsonEvalResult[]>>();
    // The skip decision depends only on the scenario + run env, so it is the
    // same for every model.
    const skipReason = shouldSkipScenario(scenario, runEnv);
    let liveSetOpened =
      scenario.reuseLiveSet === true && lastOpenedLiveSet === scenario.liveSet;

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
        // The run just mutated the Set, so the next model only inherits it
        // when the scenario resets what it writes. Same rule as trials 2+.
        liveSetOpened = scenario.reuseLiveSet === true;
        lastOpenedLiveSet = scenario.liveSet;
      }

      modelResults.set(modelKey, new Map([[label, results]]));
    }

    resultsByScenario.set(scenario.id, modelResults);
  }

  return resultsByScenario;
}
