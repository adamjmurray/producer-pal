// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Formatted output for individual eval results
 */

import {
  formatSubsectionHeader,
  BOLD,
  GRAY,
  RED,
  RESET,
  pctColor,
  scoreColor,
} from "#evals/chat/shared/formatting.ts";
import { type EvalAssertionResult, type EvalScenarioResult } from "../types.ts";
import { type JudgeResult } from "./judge-response-parser.ts";

const DIMENSION_KEYS = [
  "accuracy",
  "reasoning",
  "efficiency",
  "naturalness",
] as const;

/**
 * Print result for a single scenario run
 *
 * @param result - The scenario result
 * @param modelKey - The model identifier (provider or provider/model)
 * @param configId - Config profile ID used for this run
 */
export function printResult(
  result: EvalScenarioResult,
  modelKey: string,
  configId: string,
): void {
  const configLabel = configId === "default" ? "" : ` [${configId}]`;
  const percentage =
    result.maxScore > 0
      ? ((result.earnedScore / result.maxScore) * 100).toFixed(0)
      : "100";

  const color = scoreColor(result.earnedScore, result.maxScore);

  console.log(`\n${formatSubsectionHeader("SUMMARY")}`);
  console.log(
    `${BOLD}${modelKey}: ${result.scenario.id}${configLabel}${RESET}\n`,
  );
  console.log(`${GRAY}Duration:${RESET} ${result.totalDurationMs}ms`);

  if (result.error) {
    console.log(`${RED}Error: ${result.error}${RESET}`);
  }

  if (result.assertions.length > 0) {
    printScoreTable(result.assertions);
  }

  console.log(
    `\n${BOLD}Total: ${color}${formatScore(result.earnedScore)}/${result.maxScore} (${percentage}%)${RESET}`,
  );
}

/**
 * Print score table showing each assertion with earned/max
 *
 * @param assertions - All assertion results
 */
function printScoreTable(assertions: EvalAssertionResult[]): void {
  const typeWidth = 17;
  const scoreWidth = 10;
  const g = GRAY;
  const r = RESET;

  console.log(
    `\n${g}┌─────┬${"─".repeat(typeWidth + 2)}┬${"─".repeat(scoreWidth + 2)}┐${r}`,
  );
  console.log(
    `${g}│${r} ${BOLD}  #${r} ${g}│${r} ${BOLD}${"Type".padEnd(typeWidth)}${r} ${g}│${r} ${BOLD}${"Score".padStart(scoreWidth)}${r} ${g}│${r}`,
  );
  console.log(
    `${g}├─────┼${"─".repeat(typeWidth + 2)}┼${"─".repeat(scoreWidth + 2)}┤${r}`,
  );

  for (const [i, a] of assertions.entries()) {
    const num = String(i + 1).padStart(3);
    const type = a.assertion.type.padEnd(typeWidth);
    const score = `${formatScore(a.earned)}/${a.maxScore}`;
    const color = scoreColor(a.earned, a.maxScore);

    console.log(
      `${g}│${r} ${num} ${g}│${r} ${type} ${g}│${r} ${color}${score.padStart(scoreWidth)}${r} ${g}│${r}`,
    );

    // For LLM judge, show dimension breakdown
    if (a.assertion.type === "llm_judge") {
      printJudgeDimensions(a, typeWidth, scoreWidth);
    }
  }

  console.log(
    `${g}└─────┴${"─".repeat(typeWidth + 2)}┴${"─".repeat(scoreWidth + 2)}┘${r}`,
  );
}

/**
 * Print LLM judge dimension sub-rows
 *
 * @param assertion - The LLM judge assertion result
 * @param typeWidth - Width of the type column
 * @param scoreWidth - Width of the score column
 */
function printJudgeDimensions(
  assertion: EvalAssertionResult,
  typeWidth: number,
  scoreWidth: number,
): void {
  const details = assertion.details as JudgeResult | undefined;

  if (!details) return;

  const g = GRAY;
  const r = RESET;

  for (const dim of DIMENSION_KEYS) {
    const dimScore = details[dim].score.toFixed(2);
    const label = `  ${dim}`.padEnd(typeWidth);
    const color = pctColor(details[dim].score * 100);

    console.log(
      `${g}│${r}     ${g}│${r} ${g}${label}${r} ${g}│${r} ${color}${dimScore.padStart(scoreWidth)}${r} ${g}│${r}`,
    );
  }
}

/**
 * Format a score for display (integer if whole, 1 decimal otherwise)
 *
 * @param score - The score to format
 * @returns Formatted score string
 */
function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
