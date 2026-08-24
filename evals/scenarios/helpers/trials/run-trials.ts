// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Running one (scenario, model) combination — every trial of it — and emitting
 * a result for a scenario that was skipped instead.
 */

import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type RunEnv } from "../../run-env/run-env.ts";
import { runScenario } from "../../run-scenario.ts";
import { type EvalScenario } from "../../types.ts";
import { toJsonResult, type TrialInfo } from "../json-results/converter.ts";
import { buildSkippedResult } from "../json-results/skip-scenario.ts";
import { type JsonEvalResult } from "../json-results/types.ts";
import { writeJsonResult } from "../json-results/writer.ts";
import { printResultBlock } from "../reporting/result-printer.ts";
import { planTrialLiveSetOpens, printTrialSummary } from "./trial-helpers.ts";

/** The CLI options a trial run reads. Satisfied by the eval CLI's options. */
export interface TrialRunOptions {
  skipSetup?: boolean;
  skipJudge?: boolean;
  skipReflection?: boolean;
  seedConnect?: boolean;
  usage?: boolean;
  save?: boolean;
}

/** Shared context for a single eval run */
export interface RunContext {
  runId: string;
  judgeOverride: ModelSpec;
  repeatCount: number;
  options: TrialRunOptions;
}

/**
 * Run N trials for a single (scenario, model) combination in the run environment
 *
 * @param scenario - Scenario to run
 * @param spec - Model spec
 * @param runEnv - The active run environment
 * @param label - Run-environment label (see `envLabel`)
 * @param ctx - Shared run context
 * @param liveSetAlreadyOpened - Whether a clean Live Set is already open
 * @returns Array of JSON results (one per trial)
 */
export async function runTrials(
  scenario: EvalScenario,
  spec: ModelSpec,
  runEnv: RunEnv,
  label: string,
  ctx: RunContext,
  liveSetAlreadyOpened: boolean,
): Promise<JsonEvalResult[]> {
  const { runId, judgeOverride, repeatCount, options } = ctx;
  const modelKey = `${spec.provider}/${spec.model}`;
  const results: JsonEvalResult[] = [];
  const skipOpens = planTrialLiveSetOpens(
    repeatCount,
    liveSetAlreadyOpened,
    scenario.reuseLiveSet,
  );

  for (const [index, skipOpen] of skipOpens.entries()) {
    const trial = index + 1;
    const scenarioResult = await runScenario(scenario, {
      provider: spec.provider,
      model: spec.model,
      skipLiveSetOpen: options.skipSetup ?? skipOpen,
      judgeOverride,
      runEnv,
      envLabel: label,
      usage: options.usage,
      skipJudge: options.skipJudge,
      skipReflection: options.skipReflection,
      seedConnect: options.seedConnect,
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

    if (options.save !== false) await writeJsonResult(jsonResult);
    printResultBlock(jsonResult);
    results.push(jsonResult);
  }

  if (repeatCount > 1) {
    printTrialSummary(results);
  }

  return results;
}

/**
 * Emit a skipped result for a (scenario, model) combination: persist it (unless
 * --no-save), print it, and return it as a single-element result list.
 *
 * @param scenario - The skipped scenario
 * @param modelKey - Model key (e.g. "google/gemini-3.6-flash")
 * @param label - Run-environment label (see `envLabel`)
 * @param reason - Why the scenario was skipped
 * @param ctx - Shared run context
 * @returns Single-element array with the skipped result
 */
export async function emitSkipped(
  scenario: EvalScenario,
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
