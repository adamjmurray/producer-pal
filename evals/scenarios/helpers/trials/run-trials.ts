// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Running one trial of a (scenario, model) combination, and emitting a result
 * for a scenario that was skipped instead.
 */

import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type ThinkingByModel } from "../../run-env/parse-thinking-arg.ts";
import { type JevSettings } from "../judge/jev-first-judge.ts";
import { type RunEnv } from "../../run-env/run-env.ts";
import { runScenario } from "../../run-scenario.ts";
import { type EvalScenario } from "../../types.ts";
import {
  toJsonResult,
  type TrialInfo,
} from "../json-results/result-conversion.ts";
import { buildSkippedResult } from "../json-results/skip-scenario.ts";
import { type JsonEvalResult } from "../json-results/types.ts";
import { writeJsonResult } from "../json-results/writer.ts";
import { printResultBlock } from "../reporting/result-printer.ts";
import { type ResumedTrials } from "./resume/resumed-trials.ts";

/** The CLI options a trial run reads. Satisfied by the eval CLI's options. */
export interface TrialRunOptions {
  skipSetup?: boolean;
  skipJudge?: boolean;
  skipReflection?: boolean;
  seedConnect?: boolean;
  usage?: boolean;
  outputTokens?: number;
  save?: boolean;
}

/** Shared context for a single eval run */
export interface RunContext {
  runId: string;
  judgeOverride: ModelSpec;
  /** Set by `--jev`: Jev judges first, the LLM judge handles escalations */
  jev?: JevSettings;
  repeatCount: number;
  /** `--thinking` level per `provider/model`; a model not in it sends none. */
  thinking?: ThinkingByModel;
  options: TrialRunOptions;
  /** Set by `--resume`: the trials already done, which don't run again. */
  resumed?: ResumedTrials;
}

/**
 * Run one trial of a (scenario, model) combination in the run environment: run
 * it, save its result (unless --no-save) and print it.
 *
 * @param scenario - Scenario to run
 * @param spec - Model spec
 * @param runEnv - The active run environment
 * @param label - Run-environment label (see `envLabel`)
 * @param ctx - Shared run context
 * @param trial - Trial number, 1-indexed (the round)
 * @param liveSetAlreadyOpened - Whether a clean Live Set is already open
 * @returns The trial's JSON result
 */
export async function runTrial(
  scenario: EvalScenario,
  spec: ModelSpec,
  runEnv: RunEnv,
  label: string,
  ctx: RunContext,
  trial: number,
  liveSetAlreadyOpened: boolean,
): Promise<JsonEvalResult> {
  const { runId, judgeOverride, jev, repeatCount, options } = ctx;
  const modelKey = `${spec.provider}/${spec.model}`;
  const scenarioResult = await runScenario(scenario, {
    provider: spec.provider,
    model: spec.model,
    skipLiveSetOpen: options.skipSetup ?? liveSetAlreadyOpened,
    judgeOverride,
    runEnv,
    envLabel: label,
    usage: options.usage,
    outputTokens: options.outputTokens,
    thinking: ctx.thinking?.get(modelKey),
    skipJudge: options.skipJudge,
    jev,
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

  if (options.save !== false) {
    await writeJsonResult(jsonResult);
  }

  printResultBlock(jsonResult);

  return jsonResult;
}

/**
 * Emit a skipped result for a (scenario, model) combination: persist it (unless
 * --no-save), print it, and return it as a single-element result list.
 *
 * @param scenario - The skipped scenario
 * @param modelKey - Model key (e.g. "google/gemini-3.8-flash")
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

  if (ctx.options.save !== false) {
    await writeJsonResult(skipped);
  }

  printResultBlock(skipped);

  return [skipped];
}
