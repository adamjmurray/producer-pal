// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Formatted output for individual eval results
 */

import { styleText } from "node:util";
import {
  formatSubsectionHeader,
  formatUsageLine,
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
 * Apply gray styling to text
 *
 * @param text - Text to style
 * @returns Gray styled text
 */
function gray(text: string): string {
  return styleText("gray", text);
}

/**
 * Apply bold styling to text
 *
 * @param text - Text to style
 * @returns Bold styled text
 */
function bold(text: string): string {
  return styleText("bold", text);
}

/**
 * Print result for a single scenario run
 *
 * @param result - The scenario result
 * @param modelKey - The model identifier (provider or provider/model)
 * @param configId - Config profile ID used for this run
 * @param showUsage - Whether to display token usage totals
 */
export function printResult(
  result: EvalScenarioResult,
  modelKey: string,
  configId: string,
  showUsage?: boolean,
): void {
  const configLabel = configId === "default" ? "" : ` [${configId}]`;
  const percentage =
    result.maxScore > 0
      ? ((result.earnedScore / result.maxScore) * 100).toFixed(0)
      : "100";

  const color = scoreColor(result.earnedScore, result.maxScore);

  console.log(`\n${formatSubsectionHeader("SUMMARY")}`);
  console.log(bold(`${modelKey}: ${result.scenario.id}${configLabel}`) + "\n");
  console.log(`${gray("Duration:")} ${result.totalDurationMs}ms`);

  if (showUsage && result.totalUsage) {
    console.log(formatUsageLine(result.totalUsage));
  }

  if (result.error) {
    console.log(styleText("red", "Error: " + result.error));
  }

  if (result.assertions.length > 0) {
    printScoreTable(result.assertions);
  }

  const scoreText = `${formatScore(result.earnedScore)}/${result.maxScore} (${percentage}%)`;

  console.log("\n" + bold("Total: " + styleText(color, scoreText)));
}

/**
 * Print score table showing each assertion with earned/max
 *
 * @param assertions - All assertion results
 */
function printScoreTable(assertions: EvalAssertionResult[]): void {
  const typeWidth = 17;
  const scoreWidth = 10;
  const topBorder = gray(
    `┌─────┬${"─".repeat(typeWidth + 2)}┬${"─".repeat(scoreWidth + 2)}┐`,
  );
  const midBorder = gray(
    `├─────┼${"─".repeat(typeWidth + 2)}┼${"─".repeat(scoreWidth + 2)}┤`,
  );
  const botBorder = gray(
    `└─────┴${"─".repeat(typeWidth + 2)}┴${"─".repeat(scoreWidth + 2)}┘`,
  );
  const d = gray("│");

  console.log("\n" + topBorder);
  console.log(
    `${d} ${bold("  #")} ${d} ${bold("Type".padEnd(typeWidth))} ${d} ${bold("Score".padStart(scoreWidth))} ${d}`,
  );
  console.log(midBorder);

  for (const [i, a] of assertions.entries()) {
    const num = String(i + 1).padStart(3);
    const type = a.assertion.type.padEnd(typeWidth);
    const score = `${formatScore(a.earned)}/${a.maxScore}`;
    const color = scoreColor(a.earned, a.maxScore);
    const styledScore = styleText(color, score.padStart(scoreWidth));

    console.log(`${d} ${num} ${d} ${type} ${d} ${styledScore} ${d}`);

    // For LLM judge, show dimension breakdown
    if (a.assertion.type === "llm_judge") {
      printJudgeDimensions(a, typeWidth, scoreWidth);
    }
  }

  console.log(botBorder);
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

  const d = gray("│");

  for (const dim of DIMENSION_KEYS) {
    const dimScore = details[dim].score.toFixed(2);
    const label = `  ${dim}`.padEnd(typeWidth);
    const color = pctColor(details[dim].score * 100);
    const styledScore = styleText(color, dimScore.padStart(scoreWidth));

    console.log(`${d}     ${d} ${gray(label)} ${d} ${styledScore} ${d}`);
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
