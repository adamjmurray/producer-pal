// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario runner - executes evaluation scenarios against Ableton Live
 */

import { styleText } from "node:util";
import { formatScenarioHeader, orange } from "#evals/chat/shared/formatting.ts";
import { resetConfig, setConfig } from "#evals/shared/config.ts";
import { SYSTEM_INSTRUCTION } from "#src/shared/config.ts";
import {
  createEvalSession,
  getDefaultModel,
  type EvalSession,
} from "./eval-session.ts";
import { isQuietMode } from "./helpers/output-config.ts";
import { openLiveSet } from "./open-live-set.ts";
import { type RunEnv } from "./run-env/run-env.ts";
import {
  computeTotalUsage,
  mergeConfigs,
  resolveLiveSetPath,
  runMessageTurns,
  validateConfig,
} from "./run-scenario-helpers.ts";
import {
  runAllAssertions,
  type JudgeOverride,
} from "./helpers/scenario-sections.ts";
import {
  type EvalScenario,
  type EvalScenarioResult,
  type EvalTurnResult,
  type EvalProvider,
} from "./types.ts";

export interface RunScenarioOptions {
  provider: EvalProvider;
  model?: string;
  skipLiveSetOpen?: boolean;
  judgeOverride?: JudgeOverride;
  /** The active run environment (CLI-driven), applied via setConfig. */
  runEnv: RunEnv;
  /** Label for the run environment (see `envLabel`), used in output/results. */
  envLabel: string;
  usage?: boolean;
  skipJudge?: boolean;
  /** Skip the post-failure self-reflection turn (default: inject one). */
  skipReflection?: boolean;
  /** Seed the opening connect turn instead of paying the model for it
   *  (default: true). See `seed-connect.ts`. */
  seedConnect?: boolean;
}

/**
 * Run a single evaluation scenario
 *
 * @param scenario - The scenario to run
 * @param options - Run options including provider/model
 * @returns Scenario result with turns, assertions, and pass/fail status
 */
export async function runScenario(
  scenario: EvalScenario,
  options: RunScenarioOptions,
): Promise<EvalScenarioResult> {
  const { provider, model, skipLiveSetOpen, judgeOverride } = options;
  const startTime = Date.now();
  const turns: EvalTurnResult[] = [];
  let session: EvalSession | null = null;
  const instructions =
    scenario.instructions === null
      ? undefined
      : (scenario.instructions ?? SYSTEM_INSTRUCTION);

  try {
    // 1. Open Live Set and wait for MCP
    if (!skipLiveSetOpen) {
      const liveSetPath = resolveLiveSetPath(scenario.liveSet);

      if (!isQuietMode())
        console.log(
          "\n" + styleText("gray", "Opening Live Set: " + liveSetPath),
        );
      await openLiveSet(liveSetPath);
    }

    // 2. Apply the run environment (CLI-driven) merged with scenario-bound config
    const mergedConfig = mergeConfigs(scenario.config, options.runEnv);

    validateConfig(mergedConfig);
    await setConfig(mergedConfig);

    // 3. Create evaluation session
    const effectiveModel = model ?? getDefaultModel(provider);

    logScenarioHeader(scenario, provider, effectiveModel, options.envLabel);

    session = await createEvalSession({
      provider,
      model,
      instructions,
      usage: options.usage,
    });

    // 3b. Scenario-specific setup (e.g. clear stale clip slots, so a run
    // against an already-open Live Set still starts clean)
    await scenario.setup?.(session.mcpClient);

    // 4. Run each message turn
    await runMessageTurns(
      scenario,
      session,
      turns,
      options.seedConnect ?? true,
    );

    // 5. Run all assertions (correctness, efficiency, judge)
    const assertionResults = await runAllAssertions(
      scenario,
      turns,
      session,
      provider,
      judgeOverride,
      options.skipJudge ?? false,
      options.skipReflection ?? false,
    );

    return {
      scenario,
      configProfileId: options.envLabel,
      instructions,
      turns,
      assertions: assertionResults,
      totalDurationMs: Date.now() - startTime,
      totalUsage: computeTotalUsage(turns),
    };
  } catch (error) {
    return {
      scenario,
      configProfileId: options.envLabel,
      instructions,
      turns,
      assertions: [],
      totalDurationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (session) {
      // Scenario-specific cleanup, while the MCP session is still usable:
      // restores machine-global state (~/.producer-pal context + memory) that
      // resetConfig() below knows nothing about. Swallow failures — the
      // scenario result is already determined and must not be masked.
      try {
        await scenario.teardown?.(session.mcpClient);
      } catch (error) {
        console.warn(
          styleText(
            "yellow",
            `teardown failed for "${scenario.id}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }

      await session.close();
    }

    // Reset config to defaults after scenario completes
    try {
      await resetConfig();
    } catch {
      // Ignore reset errors - scenario result is already determined
    }
  }
}

/**
 * Print the scenario header, plus optional environment/instructions context lines.
 *
 * @param scenario - The scenario being run
 * @param provider - LLM provider being used
 * @param effectiveModel - Resolved model id
 * @param label - Active run-environment label ("default" is hidden)
 */
function logScenarioHeader(
  scenario: EvalScenario,
  provider: EvalProvider,
  effectiveModel: string,
  label: string,
): void {
  console.log(
    formatScenarioHeader(
      scenario.id,
      scenario.description,
      provider,
      effectiveModel,
    ),
  );

  if (label !== "default") {
    console.log(`${orange("|")} ${styleText("gray", "Environment:")} ${label}`);
  }

  const instructionsLabel =
    scenario.instructions !== undefined
      ? scenario.instructions == null
        ? "none"
        : "custom"
      : "default";

  console.log(
    `${orange("|")} ${styleText("gray", "Instructions:")} ${instructionsLabel}`,
  );
}

export { type JudgeOverride };
