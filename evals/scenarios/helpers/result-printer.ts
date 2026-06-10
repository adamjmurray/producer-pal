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
  formatSectionHeader,
  formatSubsectionHeader,
  formatUsageLine,
} from "#evals/chat/shared/formatting.ts";
import { formatTokenLabel } from "./json-results/assertion-label.ts";
import { type JsonEvalResult } from "./json-results/types.ts";

/**
 * Print result for a single scenario run
 *
 * @param result - The JSON eval result
 */
export function printResult(result: JsonEvalResult): void {
  const configLabel =
    result.configProfileId === "default" ? "" : ` [${result.configProfileId}]`;
  const kindLabel = result.kind ? ` (${result.kind})` : "";

  console.log(
    formatSectionHeader(
      `${result.model}: ${result.scenarioId}${configLabel}${kindLabel}`,
    ),
  );

  // Skipped scenarios never ran — no checks/efficiency/judge to print.
  if (result.result === "skipped") {
    printResultBlock(result);

    return;
  }

  if (result.error) {
    console.log(styleText("red", "Error: " + result.error));
  }

  // Checks section
  printChecksSection(result);

  // Efficiency section
  if (result.efficiency) {
    printEfficiencySection(result);
  }

  // Judge section
  if (result.judge) {
    printJudgeSection(result);
  }

  // RESULT block
  printResultBlock(result);
}

/**
 * Print the Checks section with ✓/✗ lines
 *
 * @param result - The eval result
 */
function printChecksSection(result: JsonEvalResult): void {
  const { checks } = result;
  const passed = checks.results.filter((c) => c.pass).length;
  const total = checks.results.length;
  const label = checks.pass ? "pass" : "fail";

  console.log(formatSubsectionHeader(`Checks (${passed}/${total} ${label})`));
  console.log("");

  for (const check of checks.results) {
    const icon = check.pass ? styleText("green", "✓") : styleText("red", "✗");

    console.log(`  ${icon} ${check.label}`);

    if (check.reflection) {
      console.log(styleText("gray", `    Reflection: "${check.reflection}"`));
    }
  }
}

/**
 * Print the Efficiency section
 *
 * @param result - The eval result
 */
function printEfficiencySection(result: JsonEvalResult): void {
  const eff = result.efficiency;

  if (!eff) return;

  console.log("\n" + formatSubsectionHeader("Efficiency"));
  console.log("");

  const color = efficiencyColor(eff.percentage);
  const actual = formatTokenLabel(eff.inputTokens);
  const target = formatTokenLabel(eff.targetTokens);

  console.log(
    "  " +
      styleText(
        color,
        `inputTokens ${actual} / ${target} target (${eff.percentage}%)`,
      ),
  );
}

/**
 * Print the Judge section
 *
 * @param result - The eval result
 */
function printJudgeSection(result: JsonEvalResult): void {
  const judge = result.judge;

  if (!judge) return;

  const advisory = judge.advisory === true;

  console.log(
    "\n" + formatSubsectionHeader(advisory ? "Judge (advisory)" : "Judge"),
  );

  if (judge.issues.length > 0) {
    console.log("");

    // Advisory issues don't gate the result, so show them as non-fatal notes.
    const issueColor = advisory ? "yellow" : "red";
    const issueIcon = advisory ? "•" : "✗";

    for (const issue of judge.issues) {
      console.log("  " + styleText(issueColor, `${issueIcon} ${issue}`));
    }
  }

  const label = advisory ? "advisory" : judge.pass ? "pass" : "fail";
  const color = advisory ? "yellow" : judge.pass ? "green" : "red";
  const issueSuffix =
    judge.issues.length > 0 ? ` — ${judge.issues.length} issue(s)` : "";

  console.log("\n  " + styleText(color, `${label}${issueSuffix}`));
}

/**
 * Print the final RESULT block with summary lines
 *
 * @param result - The eval result
 */
export function printResultBlock(result: JsonEvalResult): void {
  if (result.result === "skipped") {
    printSkippedBlock(result);

    return;
  }

  const overallColor = result.result === "pass" ? "green" : "red";
  const overallLabel = result.result.toUpperCase();

  console.log(
    formatSectionHeader(`RESULT: ${styleText(overallColor, overallLabel)}`),
  );

  // Checks line
  const { checks } = result;
  const passed = checks.results.filter((c) => c.pass).length;
  const total = checks.results.length;
  const checksColor = checks.pass ? "green" : "red";
  const checksLabel = checks.pass ? "pass" : "fail";

  const checksText = `${checksLabel} (${passed}/${total})`;

  console.log(`  Checks:     ${styleText(checksColor, checksText)}`);

  // Efficiency line
  if (result.efficiency) {
    const eff = result.efficiency;
    const effColor = efficiencyColor(eff.percentage);
    const actual = formatTokenLabel(eff.inputTokens);
    const target = formatTokenLabel(eff.targetTokens);
    const effText = `${eff.percentage}% (${actual} / ${target})`;

    console.log(`  Efficiency: ${styleText(effColor, effText)}`);
  }

  // Judge line
  if (result.judge) {
    const advisory = result.judge.advisory === true;
    const judgeColor = advisory
      ? "yellow"
      : result.judge.pass
        ? "green"
        : "red";
    const judgeLabel = advisory
      ? "advisory"
      : result.judge.pass
        ? "pass"
        : "fail";
    const issueSuffix =
      result.judge.issues.length > 0
        ? ` — ${result.judge.issues.length} issue(s)`
        : "";

    console.log(
      `  Judge:      ${styleText(judgeColor, judgeLabel + issueSuffix)}`,
    );
  }

  // Duration line
  const durationSec = (result.totalDurationMs / 1000).toFixed(1);

  console.log(`  Duration:   ${durationSec}s`);

  if (result.totalUsage) {
    console.log("  " + formatUsageLine(result.totalUsage));
  }
}

/**
 * Print the RESULT block for a skipped scenario (no checks/efficiency/judge)
 *
 * @param result - The skipped eval result
 */
function printSkippedBlock(result: JsonEvalResult): void {
  console.log(formatSectionHeader(`RESULT: ${styleText("yellow", "SKIPPED")}`));

  if (result.skipReason) {
    console.log(`  ${styleText("gray", result.skipReason)}`);
  }
}
