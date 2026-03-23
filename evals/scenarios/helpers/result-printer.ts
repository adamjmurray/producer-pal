// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Formatted output for individual eval results
 */

import { styleText } from "node:util";
import {
  efficiencyColor,
  formatSubsectionHeader,
  formatUsageLine,
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

  const correctnessChecks = result.checks.filter(
    (c) => c.type !== "token_usage",
  );
  const efficiencyChecks = result.checks.filter(
    (c) => c.type === "token_usage",
  );

  if (correctnessChecks.length > 0) {
    printCorrectnessTable(correctnessChecks);
  }

  const passed = result.score.passed;
  const total = result.score.total;
  const checksAllPassed = passed === total;
  const checksColor = checksAllPassed ? "green" : "red";
  const checksIcon = checksAllPassed ? "pass" : "fail";

  console.log(
    "\n" +
      bold(
        "Correctness: " +
          styleText(checksColor, `${checksIcon} (${passed}/${total})`),
      ),
  );

  if (result.review) {
    printJudge(result.review);
  }

  if (efficiencyChecks.length > 0) {
    printEfficiency(efficiencyChecks);
  }
}

/**
 * Print correctness table showing each check with pass/fail
 *
 * @param checks - Correctness check results (excludes token_usage and judge)
 */
function printCorrectnessTable(checks: JsonCheckResult[]): void {
  const labels = checks.map((c) => c.label);
  const typeWidth = Math.max(17, ...labels.map((l) => l.length));
  const resultWidth = 8;
  const topBorder = gray(
    `┌─────┬${"─".repeat(typeWidth + 2)}┬${"─".repeat(resultWidth + 2)}┐`,
  );
  const midBorder = gray(
    `├─────┼${"─".repeat(typeWidth + 2)}┼${"─".repeat(resultWidth + 2)}┤`,
  );
  const botBorder = gray(
    `└─────┴${"─".repeat(typeWidth + 2)}┴${"─".repeat(resultWidth + 2)}┘`,
  );
  const d = gray("│");

  console.log("\n" + topBorder);
  console.log(
    `${d} ${bold("  #")} ${d} ${bold("Check".padEnd(typeWidth))} ${d} ${bold("Result".padStart(resultWidth))} ${d}`,
  );
  console.log(midBorder);

  for (const [i, check] of checks.entries()) {
    const num = String(i + 1).padStart(3);
    const type = check.label.padEnd(typeWidth);
    const passText = check.pass ? "pass" : "fail";
    const color = check.pass ? "green" : "red";
    const styledResult = styleText(color, passText.padStart(resultWidth));

    console.log(`${d} ${num} ${d} ${type} ${d} ${styledResult} ${d}`);
  }

  console.log(botBorder);
}

/**
 * Print judge result as a separate line with issues
 *
 * @param review - Judge review
 */
function printJudge(review: JsonReview): void {
  const passText = review.pass ? "pass" : "fail";
  const color = review.pass ? "green" : "red";

  console.log(bold("Judge: " + styleText(color, passText)));

  for (const issue of review.issues) {
    console.log(gray(`  - ${issue}`));
  }
}

/**
 * Print efficiency section showing token usage as percentage of target
 *
 * @param checks - Token usage check results
 */
function printEfficiency(checks: JsonCheckResult[]): void {
  console.log("\n" + bold("Efficiency:"));

  for (const check of checks) {
    const pct = check.percentage ?? 0;
    const color = efficiencyColor(pct);

    console.log("  " + styleText(color, check.message));
  }
}
