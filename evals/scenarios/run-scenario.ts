// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario runner - executes evaluation scenarios against Ableton Live
 */

import { styleText } from "node:util";
import {
  efficiencyColor,
  formatScenarioHeader,
  formatSectionHeader,
  formatSubsectionHeader,
  orange,
} from "#evals/chat/shared/formatting.ts";
import { resetConfig, setConfig } from "#evals/shared/config.ts";
import { SYSTEM_INSTRUCTION } from "#webui/lib/system-instruction.ts";
import { assertWithLlmJudge, type CheckSummary } from "./assertions/index.ts";
import {
  createEvalSession,
  getDefaultModel,
  type EvalSession,
} from "./eval-session.ts";
import { isQuietMode } from "./helpers/output-config.ts";
import { maybeInjectReflection } from "./helpers/self-reflection.ts";
import { openLiveSet } from "./open-live-set.ts";
import {
  computeTotalUsage,
  mergeConfigs,
  resolveLiveSetPath,
  runCorrectnessAssertion,
  toCheckSummaries,
  validateConfig,
} from "./run-scenario-helpers.ts";
import {
  type ConfigProfile,
  type EvalScenario,
  type EvalScenarioResult,
  type EvalTurnResult,
  type EvalAssertion,
  type EvalAssertionResult,
  type EvalProvider,
} from "./types.ts";

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

    // 2. Apply merged config (scenario-bound + profile overrides)
    const mergedConfig = mergeConfigs(
      scenario.config,
      options.configProfile?.config,
    );

    if (mergedConfig) {
      validateConfig(mergedConfig);
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

    const instructionsLabel =
      scenario.instructions !== undefined
        ? scenario.instructions == null
          ? "none"
          : "custom"
        : "default";

    console.log(
      `${orange("|")} ${styleText("gray", "Instructions:")} ${instructionsLabel}`,
    );

    session = await createEvalSession({
      provider,
      model,
      instructions,
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

    // 5. Run all assertions (correctness, efficiency, judge)
    const assertionResults = await runAllAssertions(
      scenario,
      turns,
      session,
      provider,
      judgeOverride,
    );

    return {
      scenario,
      configProfileId: profileId,
      instructions,
      turns,
      assertions: assertionResults,
      totalDurationMs: Date.now() - startTime,
      totalUsage: computeTotalUsage(turns),
    };
  } catch (error) {
    return {
      scenario,
      configProfileId: options.configProfile?.id,
      instructions,
      turns,
      assertions: [],
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
    const result = await runCorrectnessAssertion(
      assertion,
      turns,
      session.mcpClient,
    );

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
 * Run all assertion types: checks, efficiency, judge — with formatted output
 *
 * @param scenario - The scenario being evaluated
 * @param turns - Completed conversation turns
 * @param session - Active evaluation session
 * @param provider - LLM provider being used
 * @param judgeOverride - Optional judge LLM override
 * @returns Combined assertion results
 */
async function runAllAssertions(
  scenario: EvalScenario,
  turns: EvalTurnResult[],
  session: EvalSession,
  provider: EvalProvider,
  judgeOverride: JudgeOverride | undefined,
): Promise<EvalAssertionResult[]> {
  const checkAssertions = scenario.assertions.filter(
    (a) => a.type !== "llm_judge" && a.type !== "token_usage",
  );
  const efficiencyAssertions = scenario.assertions.filter(
    (a) => a.type === "token_usage",
  );
  const judgeAssertions = scenario.assertions.filter(
    (a) => a.type === "llm_judge",
  );

  console.log(formatSectionHeader("EVALUATION"));

  // Checks
  const checkResults = await printChecksSection(
    checkAssertions,
    turns,
    session,
  );

  // Efficiency
  const efficiencyResults = await printEfficiencySection(
    efficiencyAssertions,
    turns,
    session,
  );

  // Self-reflection (before judge)
  await maybeInjectReflection(checkResults, turns, session);

  // Judge
  const judgeResults = await printJudgeSection(
    judgeAssertions,
    turns,
    provider,
    judgeOverride,
    toCheckSummaries(checkResults),
  );

  return [...checkResults, ...efficiencyResults, ...judgeResults];
}

/**
 * Run and print the Checks section
 *
 * @param assertions - Check assertions
 * @param turns - Conversation turns
 * @param session - Eval session
 * @returns Check assertion results
 */
async function printChecksSection(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  session: EvalSession,
): Promise<EvalAssertionResult[]> {
  console.log(formatSubsectionHeader("Checks") + "\n");

  return await runAssertions(assertions, turns, session);
}

/**
 * Run and print the Efficiency section
 *
 * @param assertions - Token usage assertions
 * @param turns - Conversation turns
 * @param session - Eval session
 * @returns Efficiency assertion results
 */
async function printEfficiencySection(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  session: EvalSession,
): Promise<EvalAssertionResult[]> {
  if (assertions.length === 0) return [];

  console.log("\n" + formatSubsectionHeader("Efficiency") + "\n");

  const results: EvalAssertionResult[] = [];

  for (const assertion of assertions) {
    const result = await runCorrectnessAssertion(
      assertion,
      turns,
      session.mcpClient,
    );

    results.push(result);

    if (!isQuietMode()) {
      const details = result.details as { percentage: number } | undefined;
      const pct = details?.percentage ?? 0;
      const color = efficiencyColor(pct);

      console.log("  " + styleText(color, result.message));
    }
  }

  return results;
}

/**
 * Run and print the Judge section
 *
 * @param assertions - Judge assertions
 * @param turns - Conversation turns
 * @param provider - LLM provider
 * @param judgeOverride - Optional judge override
 * @param checkSummaries - Check results for judge context
 * @returns Judge assertion results
 */
async function printJudgeSection(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  provider: EvalProvider,
  judgeOverride: JudgeOverride | undefined,
  checkSummaries: CheckSummary[],
): Promise<EvalAssertionResult[]> {
  if (assertions.length === 0) return [];

  const results: EvalAssertionResult[] = [];

  for (const assertion of assertions) {
    if (assertion.type !== "llm_judge") continue;

    console.log("\n" + formatSubsectionHeader("Judge"));

    const result = await assertWithLlmJudge(
      assertion,
      turns,
      provider,
      judgeOverride,
      checkSummaries,
    );

    results.push(result);

    const details = result.details as
      | { pass: boolean; issues: string[] }
      | undefined;

    printJudgeDetails(details);
  }

  return results;
}

/**
 * Print judge issues and pass/fail result
 *
 * @param details - Judge result details
 */
function printJudgeDetails(
  details: { pass: boolean; issues: string[] } | undefined,
): void {
  const pass = details?.pass ?? false;
  const issues = details?.issues ?? [];

  if (!isQuietMode() && issues.length > 0) {
    console.log("");

    for (const issue of issues) {
      console.log("  " + styleText("red", `✗ ${issue}`));
    }
  }

  const label = pass ? "pass" : "fail";
  const color = pass ? "green" : "red";
  const issueSuffix = issues.length > 0 ? ` — ${issues.length} issue(s)` : "";

  console.log("\n  " + styleText(color, `${label}${issueSuffix}`));
}
