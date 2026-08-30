// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * How an eval result reads on screen, shared by the text printers, the
 * multi-model table, and the report CLI so the same verdict never renders two
 * different ways.
 */

import {
  type JsonCheckResult,
  type JsonEvalResult,
  type JsonJudge,
} from "../json-results/types.ts";

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

/** What one failed tool call costs, as a fraction of the score. */
const TOOL_ERROR_PENALTY = 0.1;

/** The most the penalty can take, however many calls failed. */
const MAX_TOOL_ERROR_PENALTY = 0.5;

/**
 * How much a run's failed tool calls discount its score, 0-1.
 *
 * A flat cost per failed call, not a share of the calls made: rating the share
 * would pay a model for padding a run with extra successful calls, and would
 * hit a 2-call scenario ten times harder than a 20-call one for the same slip.
 *
 * @param result - A single trial result
 * @returns The discount, capped at MAX_TOOL_ERROR_PENALTY
 */
export function toolErrorPenalty(result: JsonEvalResult): number {
  const count = result.toolErrors?.count ?? 0;

  return Math.min(count * TOOL_ERROR_PENALTY, MAX_TOOL_ERROR_PENALTY);
}

/**
 * The score shown for a scenario cell, 0-100.
 *
 * The base is check pass rate for a single trial, or trial pass rate when
 * repeating. Failed tool calls then discount it: a model that errors and
 * recovers still passes, but it scores below one that got it right the first
 * time.
 *
 * @param results - One trial, or every trial for a repeated scenario
 * @returns The score, or null when there is nothing to grade
 */
export function scorePercentage(results: JsonEvalResult[]): number | null {
  const base = basePercentage(results);

  if (base == null) return null;

  const penalty =
    results.reduce((sum, r) => sum + toolErrorPenalty(r), 0) / results.length;

  return Math.round(base * (1 - penalty));
}

/**
 * The score before the tool-error penalty.
 *
 * @param results - One trial, or every trial for a repeated scenario
 * @returns The base percentage, or null when there is nothing to grade
 */
function basePercentage(results: JsonEvalResult[]): number | null {
  if (results.length === 0) return null;

  // Repeated runs grade consistency: how many trials passed outright.
  if (results.length > 1) {
    const passed = results.filter((r) => r.result === "pass").length;

    return (passed / results.length) * 100;
  }

  const { passed, total } = checkTally(
    (results[0] as JsonEvalResult).checks.results,
  );

  if (total === 0) return null;

  return (passed / total) * 100;
}
