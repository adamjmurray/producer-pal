// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Print the single-run text summary for an eval run.
 *
 * Multi-model / multi-config runs render the table in `report-table.ts`; this
 * module handles the single-model + single-config case and the per-scenario
 * line formatting.
 */

import { styleText } from "node:util";
import {
  WAVEFORM_UNIT,
  efficiencyColor,
  pctColor,
} from "#evals/chat/shared/formatting.ts";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type JsonEvalResult } from "../json-results/types.ts";
import { printResultsTable, type ResultsByScenario } from "./report-table.ts";
import { checkTally, judgeVerdict, scorePercentage } from "./result-format.ts";
import { buildMultiTrialParts, formatParts } from "../trials/trial-helpers.ts";

/**
 * Print summary of all results
 *
 * @param resultsByScenario - 3D results map
 * @param modelSpecs - All model specs tested
 * @param label - The run-environment label (see `envLabel`)
 */
export function printSummary(
  resultsByScenario: ResultsByScenario,
  modelSpecs: ModelSpec[],
  label: string,
): void {
  // Use the table for multi-model runs (a single run environment per run).
  if (modelSpecs.length > 1) {
    printResultsTable(resultsByScenario, modelSpecs, label);

    return;
  }

  // Single model + single config - use simple summary
  const allResultGroups = [...resultsByScenario.values()].flatMap((modelMap) =>
    [...modelMap.values()].flatMap((configMap) => [...configMap.values()]),
  );

  const modelLabel = modelSpecs[0]
    ? modelSpecs[0].model
      ? `${modelSpecs[0].provider}/${modelSpecs[0].model}`
      : modelSpecs[0].provider
    : "";

  const waveform = WAVEFORM_UNIT.repeat(Math.ceil(72 / WAVEFORM_UNIT.length));

  console.log("\n" + styleText("gray", waveform) + "\n");
  console.log(styleText("bold", `Summary: ${modelLabel}`) + "\n");

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const results of allResultGroups) {
    const passed = results.filter((r) => r.result === "pass").length;
    const skipped = results.filter((r) => r.result === "skipped").length;

    passCount += passed;
    skipCount += skipped;
    // Skipped runs never executed, so they count as neither pass nor fail.
    failCount += results.length - passed - skipped;

    // Show summary for the last trial (or only trial)
    const lastResult = results.at(-1) as JsonEvalResult;

    console.log("  " + formatSummaryLine(lastResult, results));

    if (lastResult.error) {
      console.log("    " + styleText("red", "Error: " + lastResult.error));
    }
  }

  const totalRuns = passCount + failCount + skipCount;
  const skipText = skipCount > 0 ? `, ${skipCount} skipped` : "";

  console.log(
    `\n  ${totalRuns} run(s): ${passCount} pass, ${failCount} fail${skipText}`,
  );
}

/**
 * Format a single scenario line for the multi-scenario summary.
 * When multiple trial results are provided, shows trial pass rate.
 *
 * @param result - Scenario result (last trial when repeating)
 * @param allTrials - All trial results for this scenario/model/config
 * @returns Formatted summary line
 */
function formatSummaryLine(
  result: JsonEvalResult,
  allTrials: JsonEvalResult[],
): string {
  // Multi-trial: aggregate stats across all trials
  if (allTrials.length > 1) {
    const statsText = formatParts(buildMultiTrialParts(allTrials));
    const allPassed = allTrials.every((t) => t.result === "pass");
    const overallColor = allPassed ? "green" : "red";

    return `${styleText(overallColor, result.scenarioId + ":")} ${statsText}`;
  }

  // Single trial: show individual check/efficiency/judge details
  return formatSingleTrialLine(result);
}

/**
 * Format a single-trial summary line with detailed check/efficiency/judge info
 *
 * @param result - Single trial result
 * @returns Formatted summary line
 */
function formatSingleTrialLine(result: JsonEvalResult): string {
  if (result.result === "skipped") {
    const reason = result.skipReason ? ` — ${result.skipReason}` : "";

    return `${styleText("yellow", result.scenarioId + ":")} ${styleText(
      "gray",
      "skipped" + reason,
    )}`;
  }

  const { checks } = result;
  const { passed, total } = checkTally(checks.results);
  const checksColor = checks.pass ? "green" : "red";
  const parts = ["checks " + styleText(checksColor, `${passed}/${total}`)];

  if (result.signals && result.signals.length > 0) {
    const tally = checkTally(result.signals);
    const color = tally.passed === tally.total ? "green" : "yellow";

    parts.push("signals " + styleText(color, `${tally.passed}/${tally.total}`));
  }

  if (result.toolErrors && result.toolErrors.count > 0) {
    parts.push(
      "tool errors " + styleText("yellow", String(result.toolErrors.count)),
    );
  }

  const score = scorePercentage([result]);

  if (score != null) {
    parts.push("score " + styleText(pctColor(score), `${score}%`));
  }

  if (result.efficiency) {
    const effColor = efficiencyColor(result.efficiency.percentage);

    parts.push(
      "efficiency " + styleText(effColor, `${result.efficiency.percentage}%`),
    );
  }

  if (result.judge) {
    const { color, label, issueCount } = judgeVerdict(result.judge);
    const issueSuffix = issueCount > 0 ? ` (${issueCount} issue(s))` : "";

    parts.push("judge " + styleText(color, label + issueSuffix));
  }

  const overallColor = result.result === "pass" ? "green" : "red";
  const id = styleText(overallColor, result.scenarioId + ":");

  return `${id} ${parts.join(" | ")}`;
}
