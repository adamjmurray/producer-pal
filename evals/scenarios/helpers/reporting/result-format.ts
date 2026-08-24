// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * How an eval result reads on screen, shared by the text printers, the
 * multi-model table, and the report CLI so the same verdict never renders two
 * different ways.
 */

import { type JsonCheckResult, type JsonJudge } from "../json-results/types.ts";

/** Passed and total counts over a set of checks. */
export interface CheckTally {
  passed: number;
  total: number;
}

/**
 * Count how many checks passed.
 *
 * @param checks - Individual check results
 * @returns Passed and total counts
 */
export function checkTally(checks: JsonCheckResult[]): CheckTally {
  return {
    passed: checks.filter((check) => check.pass).length,
    total: checks.length,
  };
}

/** How a judge verdict renders. */
export interface JudgeVerdict {
  color: "green" | "red" | "yellow";
  label: string;
  issueCount: number;
}

/**
 * Color and label for a judge verdict. An advisory judge is neither green nor
 * red — its issues are reported but don't decide the run.
 *
 * @param judge - The judge verdict
 * @returns Color, label, and issue count
 */
export function judgeVerdict(judge: JsonJudge): JudgeVerdict {
  const issueCount = judge.issues.length;

  if (judge.advisory === true) {
    return { color: "yellow", label: "advisory", issueCount };
  }

  return {
    color: judge.pass ? "green" : "red",
    label: judge.pass ? "pass" : "fail",
    issueCount,
  };
}
