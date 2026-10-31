// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The scenario runner's console sections: Checks, Signals, Efficiency, Judge.
 */

import { styleText } from "node:util";
import {
  efficiencyColor,
  formatSectionHeader,
  formatSubsectionHeader,
} from "#evals/chat/shared/formatting.ts";
import { isSignalAssertion } from "../assertions/index.ts";
import { type JevSettings } from "./judge/jev-first-judge.ts";
import {
  printJudgeSection,
  type JudgeOverride,
} from "./judge/judge-section.ts";
import { type EvalSession } from "../eval-session.ts";
import { isQuietMode } from "./quiet-mode.ts";
import { maybeInjectReflection } from "./self-reflection.ts";
import {
  runCorrectnessAssertion,
  toCheckSummaries,
} from "../run-scenario/message-turns.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalAssertionResult,
  type EvalProvider,
  type EvalTurnResult,
} from "../types.ts";

export { type JudgeOverride };

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
  return await runAssertionLoop(assertions, turns, session, (result) => {
    const pass = result.earned === result.maxScore;
    const icon = pass ? styleText("green", "✓") : styleText("red", "✗");

    console.log(`  ${icon} ${result.message}`);
  });
}

/**
 * Run each assertion in sequence, collecting results and printing each one
 * (in verbose mode) via the supplied formatter.
 *
 * @param assertions - Assertions to run
 * @param turns - Completed conversation turns
 * @param session - Active evaluation session
 * @param printResult - Per-result verbose-mode printer
 * @returns Array of assertion results
 */
async function runAssertionLoop(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  session: EvalSession,
  printResult: (result: EvalAssertionResult) => void,
): Promise<EvalAssertionResult[]> {
  const results: EvalAssertionResult[] = [];

  for (const assertion of assertions) {
    const result = await runCorrectnessAssertion(
      assertion,
      turns,
      session.mcpClient,
    );

    results.push(result);

    if (!isQuietMode()) {
      printResult(result);
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
 * @param skipJudge - When true, skip the LLM-as-judge step entirely
 * @param skipReflection - When true, skip the post-failure self-reflection turn
 * @param jev - When set, Jev judges first and the LLM judge only escalations
 * @returns Combined assertion results
 */
export async function runAllAssertions(
  scenario: EvalScenario,
  turns: EvalTurnResult[],
  session: EvalSession,
  provider: EvalProvider,
  judgeOverride: JudgeOverride | undefined,
  skipJudge: boolean,
  skipReflection: boolean,
  jev?: JevSettings,
): Promise<EvalAssertionResult[]> {
  const checkAssertions = scenario.assertions.filter(
    (a) =>
      a.type !== "llm_judge" &&
      a.type !== "token_usage" &&
      !isSignalAssertion(a),
  );
  const signalAssertions = scenario.assertions.filter(isSignalAssertion);
  const efficiencyAssertions = scenario.assertions.filter(
    (a) => a.type === "token_usage",
  );
  const judgeAssertions = skipJudge
    ? []
    : scenario.assertions.filter((a) => a.type === "llm_judge");

  console.log(formatSectionHeader("EVALUATION"));

  // Checks
  const checkResults = await printChecksSection(
    checkAssertions,
    turns,
    session,
  );

  // Signals — reported, never gating (see `isSignalAssertion`)
  const signalResults = await printSignalsSection(
    signalAssertions,
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
  if (!skipReflection) {
    await maybeInjectReflection(checkResults, turns, session);
  }

  // Judge
  const judgeResults = await printJudgeSection(
    judgeAssertions,
    turns,
    provider,
    judgeOverride,
    toCheckSummaries([...checkResults, ...signalResults]),
    jev,
  );

  return [
    ...checkResults,
    ...signalResults,
    ...efficiencyResults,
    ...judgeResults,
  ];
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
 * Run and print the Signals section — non-gating prose checks
 *
 * @param assertions - Signal assertions
 * @param turns - Conversation turns
 * @param session - Eval session
 * @returns Signal assertion results
 */
async function printSignalsSection(
  assertions: EvalAssertion[],
  turns: EvalTurnResult[],
  session: EvalSession,
): Promise<EvalAssertionResult[]> {
  if (assertions.length === 0) {
    return [];
  }

  console.log("\n" + formatSubsectionHeader("Signals") + "\n");

  return await runAssertionLoop(assertions, turns, session, (result) => {
    const pass = result.earned === result.maxScore;
    const icon = pass
      ? styleText("green", "\u2713")
      : styleText("yellow", "\u2022");

    console.log(`  ${icon} ${result.message}`);
  });
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
  if (assertions.length === 0) {
    return [];
  }

  console.log("\n" + formatSubsectionHeader("Efficiency") + "\n");

  return await runAssertionLoop(assertions, turns, session, (result) => {
    const details = result.details as { percentage: number } | undefined;
    const pct = details?.percentage ?? 0;
    const color = efficiencyColor(pct);

    console.log("  " + styleText(color, result.message));
  });
}
