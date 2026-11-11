// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Text report for a decider vs baseline decider comparison.
 */

import {
  FAIL_THRESHOLD,
  PASS_THRESHOLD,
  type DeciderJudgeResult,
} from "../decider-judge.ts";
import { type SkipCounts } from "../decider-results.ts";
import { deciderName } from "../report/decider-report.ts";
import {
  VERDICTS,
  callSpeed,
  outcomeComparison,
  probabilityStats,
  verdictTable,
  type BaselineEntry,
  type LeftOut,
  type OutcomeComparison,
  type ProbabilityStats,
  type VerdictTable,
} from "./decider-baseline-stats.ts";

/** The disagreement list is cut here; the JSON report has all of them. */
const DISAGREEMENT_LIST_LIMIT = 40;

export interface BaselineReportInput {
  entries: BaselineEntry[];
  leftOut: LeftOut[];
  skipped: SkipCounts;
  /** Names each side, e.g. "typesafe/jev-1.14.0 (recorded)" */
  baselineLabel: string;
  deciderLabel: string;
}

/**
 * Name a side by the provider/model of its answers.
 *
 * @param entries - Compared results
 * @param side - Which side
 * @param fallback - Used when there are no answers
 * @returns The name, with a count per name when several models answered
 */
export function sideName(
  entries: BaselineEntry[],
  side: "baseline" | "decider",
  fallback: string,
): string {
  const counts = new Map<string, number>();

  for (const e of entries) {
    const name = deciderName(e[side]);

    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return fallback;
  }

  return counts.size === 1
    ? [...counts.keys()].join("")
    : [...counts].map(([name, n]) => `${name} (${n})`).join(", ");
}

/**
 * Build the report lines.
 *
 * @param input - Compared results, what was left out and the side names
 * @returns Report lines
 */
export function baselineReport(input: BaselineReportInput): string[] {
  const { entries, leftOut } = input;

  return [
    "Decider vs baseline decider",
    `Baseline: ${input.baselineLabel}`,
    `Decider: ${input.deciderLabel}`,
    `Compared ${entries.length} result(s). ${leftOutLine(leftOut, input.skipped)}`,
    "",
    ...verdictLines(verdictTable(entries)),
    "",
    ...probabilityLines(entries),
    "",
    ...outcomeLines(outcomeComparison(entries)),
    "",
    ...speedLines(entries),
    "",
    ...disagreementLines(entries),
    ...errorLines(leftOut),
  ];
}

/**
 * Say what was left out and why.
 *
 * @param leftOut - Results a side gave no usable answer for
 * @param skipped - What the loader left out
 * @returns One report line
 */
function leftOutLine(leftOut: LeftOut[], skipped: SkipCounts): string {
  const count = (side: LeftOut["side"], error: boolean): number =>
    leftOut.filter((l) => l.side === side && l.error === error).length;

  return `Left out: ${count("baseline", false)} with no saved baseline answer, ${count("baseline", true)} baseline error(s), ${count("decider", true)} decider error(s); ${skipped.notScored} skipped/error, ${skipped.noScenario} unknown scenario, ${skipped.noLlmJudge} scenario without llm_judge, ${skipped.unreadable} unreadable, ${skipped.staleCriteria} recorded before the criteria changed.`;
}

/**
 * The verdict table and what it says.
 *
 * @param t - The table
 * @returns Report lines
 */
function verdictLines(t: VerdictTable): string[] {
  return [
    "Verdicts (rows: baseline, columns: decider)",
    `            ${VERDICTS.map((v) => v.padStart(9)).join("")}`,
    ...VERDICTS.map(
      (b) =>
        `  ${b.padEnd(10)}${VERDICTS.map((d) => cell(t.counts[b][d])).join("")}`,
    ),
    `Agreement ${pct(t.agreePct)} (${t.agree}/${t.n}). Escalation rate: baseline ${pct(t.baselineEscalatePct)}, decider ${pct(t.deciderEscalatePct)}.`,
    `Costly disagreements: baseline pass, decider fail ${t.baselinePassDeciderFail}; baseline fail, decider pass ${t.baselineFailDeciderPass}.`,
  ];
}

/**
 * Right-align a count in a table column.
 *
 * @param n - A count
 * @returns The count padded to the column width
 */
function cell(n: number): string {
  return String(n).padStart(9);
}

/**
 * Per-question probability comparison.
 *
 * @param entries - Compared results
 * @returns Report lines
 */
function probabilityLines(entries: BaselineEntry[]): string[] {
  return [
    `Question probabilities (questions both answered; pass line ${PASS_THRESHOLD}, fail line ${FAIL_THRESHOLD})`,
    probabilityLine("Requirement/whole", probabilityStats(entries, false)),
    probabilityLine("Claims", probabilityStats(entries, true)),
  ];
}

/**
 * One line of probability stats.
 *
 * @param title - Which questions
 * @param s - The stats
 * @returns A report line
 */
function probabilityLine(title: string, s: ProbabilityStats): string {
  if (s.n === 0) {
    return `  ${title}: none answered by both`;
  }

  return `  ${title}: n=${s.n}, mean absolute difference ${fixed(s.meanAbsDiff)}, correlation ${fixed(s.correlation)}, opposite sides of the pass line ${s.acrossPassLine}, of the fail line ${s.acrossFailLine}`;
}

/**
 * Outcome score comparison.
 *
 * @param o - The comparison
 * @returns Report lines
 */
function outcomeLines(o: OutcomeComparison): string[] {
  const same =
    o.baselineScales.length === 1 &&
    o.baselineScales.join() === o.deciderScales.join();
  const diff =
    o.meanDiff == null
      ? "n/a"
      : `${o.meanDiff >= 0 ? "+" : ""}${o.meanDiff.toFixed(2)}`;

  return [
    "Outcome score (share of each answer's own scale, 0-1)",
    `  n=${o.n}, correlation ${fixed(o.correlation)}, mean difference (decider minus baseline) ${diff}`,
    ...(same || o.n === 0
      ? []
      : [
          `  The sides used different scales: baseline ${scaleText(o.baselineScales)}, decider ${scaleText(o.deciderScales)}`,
        ]),
  ];
}

/**
 * Name the outcome scales a side used.
 *
 * @param scales - Top scores
 * @returns Text like "0-3 and 0-5"
 */
function scaleText(scales: number[]): string {
  return scales.map((s) => `0-${s}`).join(" and ") || "none";
}

/**
 * One side's speed line.
 *
 * @param title - The side's name
 * @param seconds - Seconds per call; missing for recorded answers
 * @returns A report line
 */
function speedLine(title: string, seconds: (number | undefined)[]): string {
  const stats = callSpeed(seconds.filter((s) => s != null));

  return stats == null
    ? `  ${title}: no calls`
    : `  ${title}: mean ${stats.mean.toFixed(1)}s, p90 ${stats.p90.toFixed(1)}s (n=${stats.n})`;
}

/**
 * Seconds per call, for each side that made calls.
 *
 * @param entries - Compared results
 * @returns Report lines
 */
function speedLines(entries: BaselineEntry[]): string[] {
  return [
    "Speed (seconds per call)",
    speedLine(
      "Baseline",
      entries.map((e) => e.baselineSeconds),
    ),
    speedLine(
      "Decider",
      entries.map((e) => e.deciderSeconds),
    ),
  ];
}

/**
 * List the results where the two verdicts differ.
 *
 * @param entries - Compared results
 * @returns Report lines
 */
function disagreementLines(entries: BaselineEntry[]): string[] {
  const differ = entries.filter(
    (e) => e.baseline.verdict !== e.decider.verdict,
  );
  const lines = [`Disagreements: ${differ.length}`];

  for (const e of differ.slice(0, DISAGREEMENT_LIST_LIMIT)) {
    const llm =
      e.llmPass == null ? "" : `; LLM judge ${e.llmPass ? "pass" : "fail"}`;

    lines.push(
      `- ${e.file}`,
      `  baseline ${verdictText(e.baseline)}, decider ${verdictText(e.decider)}${llm}`,
    );
  }

  if (differ.length > DISAGREEMENT_LIST_LIMIT) {
    lines.push(
      `  ... ${differ.length - DISAGREEMENT_LIST_LIMIT} more in the JSON report`,
    );
  }

  return lines;
}

/**
 * A side's verdict with its lowest probability. An escalation caused only by
 * the claims question says so, with the claims answer.
 *
 * @param answer - A decider answer
 * @returns Text like "escalate by claims 0.62 (lowest 0.95)"
 */
function verdictText(answer: DeciderJudgeResult): string {
  const claims = answer.questions.find((q) => q.kind === "claims");
  const by =
    answer.escalatedBy === "claims" && claims != null
      ? ` by claims ${claims.probability.toFixed(2)}`
      : answer.escalatedBy === "claims"
        ? " by claims"
        : "";

  return `${answer.verdict}${by} (lowest ${answer.minProbability.toFixed(2)})`;
}

/**
 * List the failed calls.
 *
 * @param leftOut - Results a side gave no usable answer for
 * @returns Report lines (empty when there are no errors)
 */
function errorLines(leftOut: LeftOut[]): string[] {
  const errors = leftOut.filter((l) => l.error);

  return errors.length === 0
    ? []
    : [
        "",
        "Errors:",
        ...errors.map((e) => `- ${e.file} (${e.side}): ${e.reason}`),
      ];
}

/**
 * Format a number to two decimals.
 *
 * @param value - A number, or null
 * @returns Text like "0.81" or "n/a"
 */
function fixed(value: number | null): string {
  return value == null ? "n/a" : value.toFixed(2);
}

/**
 * Format a percentage.
 *
 * @param value - 0-100, or null
 * @returns Text like "87.5%" or "n/a"
 */
function pct(value: number | null): string {
  return value == null ? "n/a" : `${value.toFixed(1)}%`;
}
