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
} from "#evals/chat/shared/formatting.ts";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type ConfigProfile } from "../types.ts";
import { type JsonEvalResult } from "./json-results/types.ts";
import { printResultsTable, type ResultsByScenario } from "./report-table.ts";
import { buildMultiTrialParts, formatParts } from "./trial-helpers.ts";

/**
 * Print summary of all results
 *
 * @param resultsByScenario - 3D results map
 * @param modelSpecs - All model specs tested
 * @param configProfiles - All config profiles tested
 */
export function printSummary(
  resultsByScenario: ResultsByScenario,
  modelSpecs: ModelSpec[],
  configProfiles: ConfigProfile[],
): void {
  // Use table for multi-model or multi-config runs
  if (modelSpecs.length > 1 || configProfiles.length > 1) {
    printResultsTable(resultsByScenario, modelSpecs, configProfiles);

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

  for (const results of allResultGroups) {
    const passed = results.filter((r) => r.result === "pass").length;

    passCount += passed;
    failCount += results.length - passed;

    // Show summary for the last trial (or only trial)
    const lastResult = results.at(-1) as JsonEvalResult;

    console.log("  " + formatSummaryLine(lastResult, results));

    if (lastResult.error) {
      console.log("    " + styleText("red", "Error: " + lastResult.error));
    }
  }

  const totalRuns = passCount + failCount;

  console.log(`\n  ${totalRuns} run(s): ${passCount} pass, ${failCount} fail`);
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
  const { checks } = result;
  const passed = checks.results.filter((c) => c.pass).length;
  const total = checks.results.length;
  const checksColor = checks.pass ? "green" : "red";
  const parts = ["checks " + styleText(checksColor, `${passed}/${total}`)];

  if (result.efficiency) {
    const effColor = efficiencyColor(result.efficiency.percentage);

    parts.push(
      "efficiency " + styleText(effColor, `${result.efficiency.percentage}%`),
    );
  }

  if (result.judge) {
    const judgeColor = result.judge.pass ? "green" : "red";
    const judgeText = result.judge.pass ? "pass" : "fail";
    const issueSuffix =
      result.judge.issues.length > 0
        ? ` (${result.judge.issues.length} issue(s))`
        : "";

    parts.push("judge " + styleText(judgeColor, judgeText + issueSuffix));
  }

  const overallColor = result.result === "pass" ? "green" : "red";
  const id = styleText(overallColor, result.scenarioId + ":");

  return `${id} ${parts.join(" | ")}`;
}
