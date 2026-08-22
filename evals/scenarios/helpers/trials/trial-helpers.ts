// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Helpers for the repeat/trials feature in the eval CLI
 */

import { type InspectColor, styleText } from "node:util";
import { efficiencyColor } from "#evals/chat/shared/formatting.ts";
import { type JsonEvalResult } from "../json-results/types.ts";
import { checkTally } from "../reporting/result-format.ts";

/**
 * Parse the repeat count from CLI option
 *
 * @param value - Raw CLI value (string or undefined)
 * @returns Positive integer repeat count (minimum 1)
 */
export function parseRepeatCount(value: string | undefined): number {
  if (value == null) return 1;

  const n = Number.parseInt(value, 10);

  if (Number.isNaN(n) || n < 1) {
    throw new Error(`--repeat must be a positive integer, got "${value}"`);
  }

  return n;
}

/**
 * Print a short trial pass rate summary after all trials for a triplet
 *
 * @param trials - All trial results
 */
export function printTrialSummary(trials: JsonEvalResult[]): void {
  const passed = trials.filter((r) => r.result === "pass").length;
  const color = passed === trials.length ? "green" : "red";

  console.log(
    styleText(color, `  Trials: ${passed}/${trials.length} passed\n`),
  );
}

/** A labeled, colored part for summary line assembly */
interface SummaryPart {
  label: string;
  value: string;
  color: InspectColor;
}

/**
 * Build aggregated summary parts for multi-trial runs.
 * Checks are totaled, efficiency averaged, judge shows pass rate.
 *
 * @param trials - All trial results
 * @returns Array of summary parts (trials, checks, efficiency, judge)
 */
export function buildMultiTrialParts(trials: JsonEvalResult[]): SummaryPart[] {
  const parts: SummaryPart[] = [];

  // Trial pass rate
  const trialsPassed = trials.filter((r) => r.result === "pass").length;

  parts.push({
    label: "trials",
    value: `${trialsPassed}/${trials.length}`,
    color: trialsPassed === trials.length ? "green" : "red",
  });

  // Checks: total across all trials
  const tallies = trials.map((r) => checkTally(r.checks.results));
  const checksPassed = tallies.reduce((sum, t) => sum + t.passed, 0);
  const checksTotal = tallies.reduce((sum, t) => sum + t.total, 0);

  parts.push({
    label: "checks",
    value: `${checksPassed}/${checksTotal}`,
    color: checksPassed === checksTotal ? "green" : "red",
  });

  // Efficiency: average percentage
  const effTrials = trials.filter((r) => r.efficiency != null);

  if (effTrials.length > 0) {
    const avgPct = Math.round(
      effTrials.reduce((sum, r) => sum + (r.efficiency?.percentage ?? 0), 0) /
        effTrials.length,
    );

    parts.push({
      label: "efficiency",
      value: `${avgPct}%`,
      color: efficiencyColor(avgPct),
    });
  }

  // Judge: pass rate (an advisory judge never gates, so count it as passing)
  const judgeTrials = trials.filter((r) => r.judge != null);

  if (judgeTrials.length > 0) {
    const judgePassed = judgeTrials.filter(
      (r) => r.judge?.advisory === true || r.judge?.pass,
    ).length;

    parts.push({
      label: "judge",
      value: `${judgePassed}/${judgeTrials.length}`,
      color: judgePassed === judgeTrials.length ? "green" : "red",
    });
  }

  return parts;
}

/**
 * Format summary parts into a styled string
 *
 * @param parts - Summary parts to format
 * @returns Formatted string like "checks 3/3 | efficiency 77%"
 */
export function formatParts(parts: SummaryPart[]): string {
  return parts
    .map((p) => `${p.label} ${styleText(p.color, p.value)}`)
    .join(" | ");
}

/**
 * Which trials may skip the (slow) Live Set reopen.
 *
 * A completed trial leaves the Set mutated, so trial 2 onward can only inherit
 * it when the scenario declares `reuseLiveSet` — its promise to reset whatever
 * it writes. Without that, trial 2 is graded on trial 1's leftovers, which is
 * the flakiness `--repeat` exists to detect, not to manufacture.
 *
 * @param repeatCount - Number of trials to run
 * @param liveSetAlreadyOpened - A Set the runner knows is clean is already open
 * @param reuseLiveSet - The scenario's `reuseLiveSet` flag
 * @returns One skip-the-open flag per trial, in order
 */
export function planTrialLiveSetOpens(
  repeatCount: number,
  liveSetAlreadyOpened: boolean,
  reuseLiveSet: boolean | undefined,
): boolean[] {
  return Array.from({ length: repeatCount }, (_unused, index) =>
    index === 0 ? liveSetAlreadyOpened : reuseLiveSet === true,
  );
}
