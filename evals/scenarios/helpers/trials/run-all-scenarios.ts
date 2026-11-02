// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Running every scenario for every model, in rounds: all scenarios once, then
 * all of them again, up to the repeat count. A run cancelled part-way then has
 * the same number of trials (give or take one) of every scenario, instead of
 * all of them for some and none for the rest.
 */

import { styleText } from "node:util";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { shouldSkipScenario } from "../json-results/skip-scenario.ts";
import { type JsonEvalResult } from "../json-results/types.ts";
import { resultFilePath } from "../json-results/writer.ts";
import { type ResultsByScenario } from "../reporting/report-table.ts";
import { type RunEnv } from "../../run-env/run-env.ts";
import { type EvalScenario } from "../../types.ts";
import { liveSetLeftClean, printTrialSummary } from "./multi-trial-runs.ts";
import { dropReplacedError, trialKey } from "./resume/resumed-trials.ts";
import { describeRunAbort, stalledModels } from "./run-abort.ts";
import { emitSkipped, runTrial, type RunContext } from "./run-trials.ts";

/**
 * Run all scenarios across models in the active run environment, collecting
 * results. The result map keeps its 3-level shape (scenario → model → label)
 * for the reporting layer; with a single run environment the innermost map has
 * exactly one entry, keyed by `label`, holding that cell's trials in order.
 *
 * Skipped scenarios are skipped once (round 1), as a single result. A trial a
 * resumed run already finished is not run again; its saved result is used.
 *
 * @param scenarios - Scenarios to run
 * @param modelSpecs - Models to test
 * @param runEnv - The active run environment
 * @param label - The run-environment label (see `envLabel`)
 * @param ctx - Shared run context
 * @returns 3D results map
 */
export async function runAllScenarios(
  scenarios: EvalScenario[],
  modelSpecs: ModelSpec[],
  runEnv: RunEnv,
  label: string,
  ctx: RunContext,
): Promise<ResultsByScenario> {
  const resultsByScenario: ResultsByScenario = new Map(
    scenarios.map((scenario) => [scenario.id, new Map()]),
  );
  const state: RunState = {
    cleanLiveSet: null,
    errorStreaks: new Map(),
    activeSpecs: modelSpecs,
  };

  for (let round = 1; round <= ctx.repeatCount; round++) {
    if (ctx.repeatCount > 1) {
      console.log(styleText("bold", `\nRound ${round}/${ctx.repeatCount}\n`));
    }

    for (const scenario of scenarios) {
      await runScenarioRound(
        scenario,
        round,
        resultsByScenario.get(scenario.id) as ModelResults,
        runEnv,
        label,
        ctx,
        state,
      );
    }
  }

  return resultsByScenario;
}

type ModelResults = Map<string, Map<string, JsonEvalResult[]>>;

/** What carries from one run to the next. */
interface RunState {
  /** The Set the previous run left clean (a `reuseLiveSet` scenario that
   *  ran); the next `reuseLiveSet` scenario on the same Set skips the reopen.
   *  Carries across rounds and models. */
  cleanLiveSet: string | null;
  /** Per model, consecutive trials that errored. Live not coming back or the
   *  provider refusing every request won't recover, and a long unattended run
   *  would otherwise fill the results directory with scenarios nobody ever
   *  asked a model about. */
  errorStreaks: Map<string, number>;
  /** Models still running. */
  activeSpecs: ModelSpec[];
}

/**
 * Run one round of one scenario across the active models, appending to each
 * model's results.
 *
 * @param scenario - Scenario to run
 * @param round - Round (trial) number, 1-indexed
 * @param modelResults - The scenario's results so far, updated in place
 * @param runEnv - The active run environment
 * @param label - The run-environment label (see `envLabel`)
 * @param ctx - Shared run context
 * @param state - Carry-over between runs, updated in place
 */
async function runScenarioRound(
  scenario: EvalScenario,
  round: number,
  modelResults: ModelResults,
  runEnv: RunEnv,
  label: string,
  ctx: RunContext,
  state: RunState,
): Promise<void> {
  // The skip decision depends only on the scenario + run env, so it is the
  // same for every model and every round.
  const skipReason = shouldSkipScenario(scenario, runEnv);

  if (skipReason != null && round > 1) {
    return;
  }

  const latest: ModelResults = new Map();

  for (const spec of state.activeSpecs) {
    const modelKey = `${spec.provider}/${spec.model}`;
    const results = modelResults.get(modelKey)?.get(label) ?? [];

    modelResults.set(modelKey, new Map([[label, results]]));

    const key = trialKey(scenario.id, modelKey, label, round);
    const done = ctx.resumed?.done.get(key);

    if (done != null) {
      results.push(done);
      continue;
    }

    if (skipReason != null) {
      // Skipped before running: no Live Set is opened, so leave
      // `cleanLiveSet` untouched.
      results.push(
        ...(await emitSkipped(scenario, modelKey, label, skipReason, ctx)),
      );
      continue;
    }

    const result = await runTrial(
      scenario,
      spec,
      runEnv,
      label,
      ctx,
      round,
      scenario.reuseLiveSet === true && state.cleanLiveSet === scenario.liveSet,
    );

    if (ctx.resumed != null && ctx.options.save !== false) {
      await dropReplacedError(ctx.resumed, key, resultFilePath(result));
    }

    results.push(result);
    latest.set(modelKey, new Map([[label, [result]]]));
    // Only a scenario that resets what it writes hands the Set on. A run that
    // errored may have failed the open.
    state.cleanLiveSet = liveSetLeftClean(scenario.reuseLiveSet, result)
      ? scenario.liveSet
      : null;

    if (ctx.repeatCount > 1 && round === ctx.repeatCount) {
      printTrialSummary(results);
    }
  }

  state.activeSpecs = dropStalledModels(
    state.activeSpecs,
    state.errorStreaks,
    latest,
  );
}

/**
 * Drop each model whose last few trials all errored, warning about it. Throws
 * when no model is left.
 *
 * @param specs - Models still running
 * @param streaks - Each model's error streak, updated in place
 * @param latest - The trials just run, by model and label
 * @returns The models to keep running
 */
function dropStalledModels(
  specs: ModelSpec[],
  streaks: Map<string, number>,
  latest: ModelResults,
): ModelSpec[] {
  const stalled = stalledModels(streaks, latest);
  const kept = specs.filter(
    (spec) => !stalled.has(`${spec.provider}/${spec.model}`),
  );

  if (kept.length === 0) {
    const [modelKey, runs] = [...stalled].at(-1) ?? ["", []];

    throw new Error(describeRunAbort(streaks.get(modelKey) ?? 0, runs));
  }

  for (const [modelKey, runs] of stalled) {
    console.warn(
      styleText(
        "yellow",
        describeRunAbort(streaks.get(modelKey) ?? 0, runs, modelKey),
      ),
    );
  }

  return kept;
}
