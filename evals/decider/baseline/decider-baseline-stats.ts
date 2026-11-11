// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The numbers behind a decider vs baseline decider comparison: verdict table,
 * per-question probabilities, outcome scores and call speed.
 */

import {
  FAIL_THRESHOLD,
  PASS_THRESHOLD,
  type DeciderJudgeResult,
  type DeciderVerdict,
} from "../decider-judge.ts";

/** One result both sides answered. */
export interface BaselineEntry {
  file: string;
  scenarioId: string;
  checksPass: boolean;
  /** The LLM judge's verdict saved in the result, when one ran */
  llmPass?: boolean;
  baseline: DeciderJudgeResult;
  decider: DeciderJudgeResult;
  /** Seconds the call took; missing for a recorded answer */
  baselineSeconds?: number;
  deciderSeconds?: number;
}

/** A result one side gave no usable answer for. */
export interface LeftOut {
  file: string;
  side: "baseline" | "decider";
  /** Why; "no saved answer" or the error message */
  reason: string;
  error: boolean;
}

export type SidePair = Pick<BaselineEntry, "baseline" | "decider">;

export const VERDICTS: DeciderVerdict[] = ["pass", "fail", "escalate"];

export interface VerdictTable {
  n: number;
  /** counts[baseline verdict][decider verdict] */
  counts: Record<DeciderVerdict, Record<DeciderVerdict, number>>;
  agree: number;
  /** 0-100, or null with no rows */
  agreePct: number | null;
  baselineEscalatePct: number | null;
  deciderEscalatePct: number | null;
  /** Baseline pass, decider fail */
  baselinePassDeciderFail: number;
  /** Baseline fail, decider pass */
  baselineFailDeciderPass: number;
}

/**
 * Cross-tabulate the two sides' verdicts.
 *
 * @param pairs - Results both sides answered
 * @returns The table and the rates read off it
 */
export function verdictTable(pairs: SidePair[]): VerdictTable {
  const counts = { pass: emptyRow(), fail: emptyRow(), escalate: emptyRow() };

  for (const p of pairs) {
    counts[p.baseline.verdict][p.decider.verdict]++;
  }

  const n = pairs.length;
  const agree = VERDICTS.reduce((sum, v) => sum + counts[v][v], 0);
  const rate = (count: number): number | null =>
    n === 0 ? null : (count / n) * 100;

  return {
    n,
    counts,
    agree,
    agreePct: rate(agree),
    baselineEscalatePct: rate(pairs.filter(isEscalated("baseline")).length),
    deciderEscalatePct: rate(pairs.filter(isEscalated("decider")).length),
    baselinePassDeciderFail: counts.pass.fail,
    baselineFailDeciderPass: counts.fail.pass,
  };
}

/**
 * A row of zero counts.
 *
 * @returns Zero for each verdict
 */
function emptyRow(): Record<DeciderVerdict, number> {
  return { pass: 0, fail: 0, escalate: 0 };
}

/**
 * Pick the pairs one side escalated.
 *
 * @param side - Which side
 * @returns A filter for pairs
 */
function isEscalated(side: "baseline" | "decider") {
  return (p: SidePair): boolean => p[side].verdict === "escalate";
}

export interface ProbabilityStats {
  /** Questions both sides answered */
  n: number;
  meanAbsDiff: number | null;
  correlation: number | null;
  /** One side at or above the pass threshold, the other below it */
  acrossPassLine: number;
  /** One side below the fail threshold, the other at or above it */
  acrossFailLine: number;
}

/**
 * Compare the two sides' answers to the questions both answered (same id).
 *
 * @param pairs - Results both sides answered
 * @param claims - True for the claims question, false for requirement and whole questions
 * @returns Difference, correlation and threshold splits
 */
export function probabilityStats(
  pairs: SidePair[],
  claims: boolean,
): ProbabilityStats {
  const base: number[] = [];
  const other: number[] = [];

  for (const p of pairs) {
    for (const q of p.baseline.questions) {
      const match = p.decider.questions.find((d) => d.id === q.id);

      if (match != null && (q.kind === "claims") === claims) {
        base.push(q.probability);
        other.push(match.probability);
      }
    }
  }

  const across = (line: number): number =>
    base.filter((b, i) => b < line !== (other[i] as number) < line).length;

  return {
    n: base.length,
    meanAbsDiff: mean(base.map((b, i) => Math.abs(b - (other[i] as number)))),
    correlation: correlation(base, other),
    acrossPassLine: across(PASS_THRESHOLD),
    acrossFailLine: across(FAIL_THRESHOLD),
  };
}

export interface OutcomeComparison {
  n: number;
  correlation: number | null;
  /** Mean of decider minus baseline, each as a share (0-1) of its own scale */
  meanDiff: number | null;
  baselineScales: number[];
  deciderScales: number[];
}

/**
 * Compare the graded outcome scores, each as a share of its own scale.
 *
 * @param pairs - Results both sides answered
 * @returns Correlation, mean difference and the scales used
 */
export function outcomeComparison(pairs: SidePair[]): OutcomeComparison {
  const base = pairs.map((p) => outcomeShare(p.baseline.outcome));
  const other = pairs.map((p) => outcomeShare(p.decider.outcome));
  const scales = (side: "baseline" | "decider"): number[] =>
    [...new Set(pairs.map((p) => p[side].outcome.maxScore))].toSorted(
      (a, b) => a - b,
    );

  return {
    n: pairs.length,
    correlation: correlation(base, other),
    meanDiff: mean(other.map((o, i) => o - (base[i] as number))),
    baselineScales: scales("baseline"),
    deciderScales: scales("decider"),
  };
}

/**
 * An outcome score as a share of its own scale.
 *
 * @param o - A decider outcome
 * @returns 0 to 1
 */
function outcomeShare(o: DeciderJudgeResult["outcome"]): number {
  return o.score / o.maxScore;
}

/**
 * Mean and 90th percentile (nearest rank) of call times.
 *
 * @param seconds - Seconds per call
 * @returns The stats, or undefined with no calls
 */
export function callSpeed(
  seconds: number[],
): { n: number; mean: number; p90: number } | undefined {
  if (seconds.length === 0) {
    return undefined;
  }

  const sorted = seconds.toSorted((a, b) => a - b);

  return {
    n: sorted.length,
    mean: mean(sorted) as number,
    p90: sorted[Math.ceil(sorted.length * 0.9) - 1] as number,
  };
}

/**
 * Pearson correlation.
 *
 * @param xs - First series
 * @param ys - Second series, same length
 * @returns -1 to 1, or null with under two points or no spread in either series
 */
export function correlation(xs: number[], ys: number[]): number | null {
  const mx = mean(xs);
  const my = mean(ys);

  if (xs.length < 2 || mx == null || my == null) {
    return null;
  }

  let cov = 0;
  let vx = 0;
  let vy = 0;

  for (const [i, x] of xs.entries()) {
    const dx = x - mx;
    const dy = (ys[i] as number) - my;

    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }

  return vx === 0 || vy === 0 ? null : cov / Math.sqrt(vx * vy);
}

/**
 * Average a list.
 *
 * @param values - Numbers
 * @returns The mean, or null for an empty list
 */
function mean(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, v) => sum + v, 0) / values.length;
}
