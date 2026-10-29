// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Counts how Jev's three-way verdicts line up with the stored judge.
 */

import { type JevVerdict } from "./jev-judge.ts";

export interface VerdictPair {
  judgePass: boolean;
  jev: JevVerdict;
}

export interface VerdictStats {
  n: number;
  judgeFails: number;
  jevPass: number;
  jevFail: number;
  escalate: number;
  /** 0-100, or null with no rows */
  escalatePct: number | null;
  /** Jev pass, judge fail */
  wrongPass: number;
  /** Jev fail, judge pass */
  wrongFail: number;
  /** Agreement among results Jev did not escalate; 0-100, or null if none */
  agreePct: number | null;
}

/**
 * Count verdicts and where Jev is wrong, taking the stored judge as right.
 *
 * @param pairs - One verdict pair per compared result
 * @returns Counts and percentages
 */
export function summarizeAgreement(pairs: VerdictPair[]): VerdictStats {
  const count = (keep: (p: VerdictPair) => boolean): number =>
    pairs.filter(keep).length;
  const jevPass = count((p) => p.jev === "pass");
  const jevFail = count((p) => p.jev === "fail");
  const escalate = count((p) => p.jev === "escalate");
  const wrongPass = count((p) => p.jev === "pass" && !p.judgePass);
  const wrongFail = count((p) => p.jev === "fail" && p.judgePass);
  const decided = jevPass + jevFail;

  return {
    n: pairs.length,
    judgeFails: count((p) => !p.judgePass),
    jevPass,
    jevFail,
    escalate,
    escalatePct: pairs.length === 0 ? null : (escalate / pairs.length) * 100,
    wrongPass,
    wrongFail,
    agreePct:
      decided === 0
        ? null
        : ((decided - wrongPass - wrongFail) / decided) * 100,
  };
}

export interface OutcomeRow {
  judgePass: boolean;
  /** Jev's outcome score */
  score: number;
}

export interface OutcomeStats {
  passN: number;
  failN: number;
  /** Mean score on stored-judge passes, or null with none */
  passMean: number | null;
  /** Mean score on stored-judge fails, or null with none */
  failMean: number | null;
  /** See `rankAuc`; null unless both groups have rows */
  auc: number | null;
}

/**
 * Compare Jev's outcome scores on results the stored judge passed and failed.
 *
 * @param rows - One row per compared result
 * @returns Group sizes, means and AUC
 */
export function summarizeOutcome(rows: OutcomeRow[]): OutcomeStats {
  const passes = rows.filter((r) => r.judgePass).map((r) => r.score);
  const fails = rows.filter((r) => !r.judgePass).map((r) => r.score);

  return {
    passN: passes.length,
    failN: fails.length,
    passMean: mean(passes),
    failMean: mean(fails),
    auc: rankAuc(fails, passes),
  };
}

/**
 * Chance that a random stored-judge fail scores lower than a random pass.
 * Ties count half. 0.5 is no signal; 1 is perfect separation.
 *
 * @param fails - Scores of results the judge failed
 * @param passes - Scores of results the judge passed
 * @returns The probability, or null when either list is empty
 */
export function rankAuc(fails: number[], passes: number[]): number | null {
  if (fails.length === 0 || passes.length === 0) {
    return null;
  }

  let wins = 0;

  for (const f of fails) {
    for (const p of passes) {
      wins += f < p ? 1 : f === p ? 0.5 : 0;
    }
  }

  return wins / (fails.length * passes.length);
}

/**
 * Average a list.
 *
 * @param values - Numbers to average
 * @returns The mean, or null for an empty list
 */
function mean(values: number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, v) => sum + v, 0) / values.length;
}
