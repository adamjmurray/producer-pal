// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario runner - executes evaluation scenarios against Ableton Live
 */

import { styleText } from "node:util";
import {
  formatScenarioHeader,
  formatSectionHeader,
  formatSubsectionHeader,
  orange,
  scoreColor,
} from "#evals/chat/shared/formatting.ts";
import {
  resetConfig,
  setConfig,
  type ConfigOptions,
} from "#evals/shared/config.ts";
import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import {
  assertCustom,
  assertToolCalled,
  assertState,
  assertWithLlmJudge,
  assertResponseContains,
} from "./assertions/index.ts";
import {
  createEvalSession,
  getDefaultModel,
  type EvalSession,
} from "./eval-session.ts";
import { isQuietMode } from "./helpers/output-config.ts";
import { openLiveSet } from "./open-live-set.ts";
import {
  type ConfigProfile,
  type EvalScenario,
  type EvalScenarioResult,
  type EvalTurnResult,
  type EvalAssertion,
  type EvalAssertionResult,
  type EvalProvider,
  type MatrixConfigValues,
} from "./types.ts";

/**
 * Sum a numeric field across assertion results
 *
 * @param results - Assertion results to sum
 * @param field - Field name to sum
 * @returns Sum of the field values
 */
function sumField(
  results: EvalAssertionResult[],
  field: "earned" | "maxScore",
): number {
  return results.reduce((sum, r) => sum + r[field], 0);
}

const LIVE_SETS_DIR = "evals/live-sets";

export interface JudgeOverride {
  provider: EvalProvider;
  model?: string;
}

export interface RunScenarioOptions {
  provider: EvalProvider;
  model?: string;
  skipLiveSetOpen?: boolean;
  judgeOverride?: JudgeOverride;
  configProfile?: ConfigProfile;
  usage?: boolean;
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

    // 2. Apply merged config (scenario-bound + profile overrides)
    const mergedConfig = mergeConfigs(
      scenario.config,
      options.configProfile?.config,
    );

    if (mergedConfig) {
      if (!isQuietMode()) console.log(styleText("gray", "Applying config..."));
      await setConfig(mergedConfig);
    }

    // 3. Create evaluation session
    const effectiveModel = model ?? getDefaultModel(provider);

    console.log(
      formatScenarioHeader(
        scenario.id,
        scenario.description,
        provider,
        effectiveModel,
      ),
    );

    const profileId = options.configProfile?.id;

    if (profileId && profileId !== "default") {
      console.log(
        `${orange("|")} ${styleText("gray", "Config:")} ${profileId}`,
      );
    }

    session = await createEvalSession({
      provider,
      model,
      instructions: scenario.instructions,
      usage: options.usage,
    });

    // 4. Run each message turn
    for (const [i, message] of scenario.messages.entries()) {
      const turnStart = Date.now();
      const turnResult = await session.sendMessage(message, i + 1);

      turns.push({
        turnIndex: i,
        userMessage: message,
        assistantResponse: turnResult.text,
        toolCalls: turnResult.toolCalls,
        durationMs: Date.now() - turnStart,
        stepUsages: turnResult.stepUsages,
      });
    }

    // 5. Run assertions - split into correctness checks and LLM judge
    const correctnessAssertions = scenario.assertions.filter(
      (a) => a.type !== "llm_judge",
    );
    const judgeAssertions = scenario.assertions.filter(
      (a) => a.type === "llm_judge",
    );

    const correctnessResults = await runCorrectnessChecks(
      correctnessAssertions,
      turns,
      session,
    );

    // Run LLM judge assertions
    const judgeResults = await runJudgeAssertions(
      judgeAssertions,
      turns,
      provider,
      judgeOverride,
    );

    const assertionResults = [...correctnessResults, ...judgeResults];
    const earnedScore = sumField(assertionResults, "earned");
    const maxScore = sumField(assertionResults, "maxScore");

    return {
      scenario,
      configProfileId: profileId,
      turns,
      assertions: assertionResults,
      earnedScore,
      maxScore,
      totalDurationMs: Date.now() - startTime,
      totalUsage: computeTotalUsage(turns),
    };
  } catch (error) {
    return {
      scenario,
      configProfileId: options.configProfile?.id,
      turns,
      assertions: [],
      earnedScore: 0,
      maxScore: 0,
      totalDurationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (session) {
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
 * Run correctness assertions (non-LLM judge)
 *
 * @param assertions - Assertions to run
 * @param turns - Completed conversation turns
 * @param session - Active evaluation session
 * @returns Array of assertion results
 */
async function runAssertions(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  session: EvalSession,
): Promise<EvalAssertionResult[]> {
  const results: EvalAssertionResult[] = [];

  for (const assertion of assertions) {
    const result = await runCorrectnessAssertion(assertion, turns, session);

    results.push(result);

    // Show results in verbose mode
    if (!isQuietMode()) {
      const pass = result.earned === result.maxScore;
      const icon = pass ? styleText("green", "✓") : styleText("red", "✗");

      console.log(`  ${icon} ${result.message}`);
    }
  }

  return results;
}

/**
 * Run correctness checks with formatted output
 *
 * @param assertions - Correctness assertions to run
 * @param turns - Completed conversation turns
 * @param session - Active evaluation session
 * @returns Array of assertion results
 */
async function runCorrectnessChecks(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  session: EvalSession,
): Promise<EvalAssertionResult[]> {
  console.log(formatSectionHeader("EVALUATION"));
  console.log(formatSubsectionHeader("Correctness Checks"));
  console.log(
    "\n" + styleText("gray", "Running " + assertions.length + " check(s)..."),
  );

  const results = await runAssertions(assertions, turns, session);
  const earned = sumField(results, "earned");
  const max = sumField(results, "maxScore");

  if (max > 0) {
    const pct = ((earned / max) * 100).toFixed(0);
    const color = scoreColor(earned, max);

    const scoreText = earned + "/" + max + " (" + pct + "%)";

    console.log("\nCorrectness: " + styleText(color, scoreText));
  }

  return results;
}

/**
 * Run LLM judge assertions (without printing pass/fail status)
 *
 * @param assertions - Judge assertions to run
 * @param turns - Completed conversation turns
 * @param provider - LLM provider being used
 * @param judgeOverride - Optional judge LLM override
 * @returns Array of assertion results
 */
async function runJudgeAssertions(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  provider: EvalProvider,
  judgeOverride?: JudgeOverride,
): Promise<EvalAssertionResult[]> {
  const results: EvalAssertionResult[] = [];

  for (const assertion of assertions) {
    if (assertion.type === "llm_judge") {
      const result = await assertWithLlmJudge(
        assertion,
        turns,
        provider,
        judgeOverride,
      );

      results.push(result);
    }
  }

  return results;
}

/**
 * Run a single correctness assertion (non-LLM judge)
 *
 * @param assertion - The assertion to evaluate
 * @param turns - Completed conversation turns
 * @param session - Active evaluation session
 * @returns Assertion result
 */
async function runCorrectnessAssertion(
  assertion: EvalAssertion,
  turns: EvalTurnResult[],
  session: EvalSession,
): Promise<EvalAssertionResult> {
  switch (assertion.type) {
    case "tool_called":
      return assertToolCalled(assertion, turns);

    case "state":
      return await assertState(assertion, session.mcpClient);

    case "response_contains":
      return assertResponseContains(assertion, turns);

    case "custom":
      return assertCustom(assertion, turns);

    default:
      return {
        assertion,
        earned: 0,
        maxScore: 0,
        message: `Unknown assertion type: ${(assertion as EvalAssertion).type}`,
      };
  }
}

/**
 * Merge scenario-bound config with matrix profile config.
 * Profile values override scenario values for any overlapping keys.
 *
 * @param scenarioConfig - Scenario-bound config (memory, sampleFolder)
 * @param profileConfig - Matrix profile config (smallModelMode, jsonOutput, tools)
 * @returns Merged config, or undefined if both inputs are empty
 */
function mergeConfigs(
  scenarioConfig?: ConfigOptions,
  profileConfig?: MatrixConfigValues,
): ConfigOptions | undefined {
  if (!scenarioConfig && !profileConfig) return undefined;

  return { ...scenarioConfig, ...profileConfig };
}

/**
 * Resolve a liveSet value to a full path.
 * If it's a short name (no `/`), resolves to the Ableton project structure.
 *
 * @param liveSet - Short name or full path
 * @returns Full path to the .als file
 */
function resolveLiveSetPath(liveSet: string): string {
  if (liveSet.includes("/")) {
    return liveSet;
  }

  // Ableton stores .als files in "{name} Project/{name}.als"
  return `${LIVE_SETS_DIR}/${liveSet} Project/${liveSet}.als`;
}

/**
 * Sum token usage across all steps of all turns.
 *
 * @param turns - Completed conversation turns with step usage data
 * @returns Total usage, or undefined if no usage data
 */
function computeTotalUsage(turns: EvalTurnResult[]): TokenUsage | undefined {
  let input = 0;
  let output = 0;
  let reasoning = 0;
  let hasUsage = false;

  for (const turn of turns) {
    for (const step of turn.stepUsages ?? []) {
      hasUsage = true;
      input += step.inputTokens ?? 0;
      output += step.outputTokens ?? 0;
      reasoning += step.reasoningTokens ?? 0;
    }
  }

  if (!hasUsage) return undefined;

  return {
    inputTokens: input,
    outputTokens: output,
    ...(reasoning > 0 && { reasoningTokens: reasoning }),
  };
}
