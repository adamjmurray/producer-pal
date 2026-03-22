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
  scoreColor,
} from "#evals/chat/shared/formatting.ts";
import {
  type JsonCheckResult,
  type JsonEvalResult,
  type JsonReview,
} from "./json-results/types.ts";

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
 * @param result - The JSON eval result
 * @param showUsage - Whether to display token usage totals
 */
export function printResult(result: JsonEvalResult, showUsage?: boolean): void {
  const configLabel =
    result.configProfileId === "default" ? "" : ` [${result.configProfileId}]`;

  const color = scoreColor(result.score.earned, result.score.max);

  console.log(`\n${formatSubsectionHeader("SUMMARY")}`);
  console.log(
    bold(`${result.model}: ${result.scenarioId}${configLabel}`) + "\n",
  );
  console.log(`${gray("Duration:")} ${result.totalDurationMs}ms`);

  if (showUsage && result.totalUsage) {
    console.log(formatUsageLine(result.totalUsage));
  }

  if (result.error) {
    console.log(styleText("red", "Error: " + result.error));
  }

  if (result.checks.length > 0 || result.review) {
    printScoreTable(result.checks, result.review);
  }

  const scoreText = `${formatScore(result.score.earned)}/${result.score.max} (${result.score.percentage}%)`;

  console.log("\n" + bold("Total: " + styleText(color, scoreText)));
}

/**
 * Print score table showing each check with earned/max, plus judge row
 *
 * @param checks - Deterministic check results
 * @param review - Judge review (if any)
 */
function printScoreTable(
  checks: JsonCheckResult[],
  review: JsonReview | undefined,
): void {
  const labels = checks.map((c) => c.label);

  if (review) labels.push("llm_judge");

  const typeWidth = Math.max(17, ...labels.map((l) => l.length));
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

  for (const [i, check] of checks.entries()) {
    const num = String(i + 1).padStart(3);
    const type = check.label.padEnd(typeWidth);
    const score = `${formatScore(check.earned)}/${check.maxScore}`;
    const color = scoreColor(check.earned, check.maxScore);
    const styledScore = styleText(color, score.padStart(scoreWidth));

    console.log(`${d} ${num} ${d} ${type} ${d} ${styledScore} ${d}`);
  }

  if (review) {
    const idx = checks.length + 1;
    const num = String(idx).padStart(3);
    const type = "llm_judge".padEnd(typeWidth);
    const passText = review.pass ? "pass" : "fail";
    const color = review.pass ? "green" : "red";
    const styledScore = styleText(color, passText.padStart(scoreWidth));

    console.log(`${d} ${num} ${d} ${type} ${d} ${styledScore} ${d}`);
  }

  console.log(botBorder);

  // Print issues below the table so they aren't truncated by column width
  if (review && review.issues.length > 0) {
    for (const issue of review.issues) {
      console.log(gray(`  - ${issue}`));
    }
  }
}

/**
 * Format a score for display (integer if whole, 1 decimal otherwise)
 *
 * @param score - The score to format
 * @returns Formatted score string
 */
export function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
