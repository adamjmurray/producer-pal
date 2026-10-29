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
