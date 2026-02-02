/**
 * Correctness score calculation from deterministic assertions
 */

import type { EvalAssertionResult } from "../types.ts";

interface ToolCallDetails {
  nameMatchCount: number;
  argsSpecified: boolean;
  count: number;
}

export interface CorrectnessBreakdown {
  earned: number;
  max: number;
  score: number;
}

/**
 * Compute correctness breakdown from assertion results
 *
 * Scoring:
 * - tool_called: +1 for name match, +1 for args match (if specified)
 * - state, response_contains: +1 if passed
 *
 * @param assertions - All assertion results from the scenario
 * @returns Breakdown with earned points, max points, and 0-5 score
 */
export function computeCorrectnessBreakdown(
  assertions: EvalAssertionResult[],
): CorrectnessBreakdown {
  const nonJudgeAssertions = assertions.filter(
    (a) => a.assertion.type !== "llm_judge",
  );

  if (nonJudgeAssertions.length === 0) {
    return { earned: 0, max: 0, score: 5 }; // No checks = full score
  }

  let earned = 0;
  let max = 0;

  for (const result of nonJudgeAssertions) {
    if (result.assertion.type === "tool_called") {
      const details = result.details as ToolCallDetails;

      // Name match
      max += 1;

      if (details.nameMatchCount > 0) earned += 1;

      // Args match (if specified)
      if (details.argsSpecified) {
        max += 1;

        if (details.count > 0) earned += 1;
      }
    } else {
      // state, response_contains
      max += 1;

      if (result.passed) earned += 1;
    }
  }

  const score = max > 0 ? (earned / max) * 5 : 5;

  return { earned, max, score };
}

/**
 * Compute correctness score from assertion results (convenience wrapper)
 *
 * @param assertions - All assertion results from the scenario
 * @returns Correctness score (0-5)
 */
export function computeCorrectnessScore(
  assertions: EvalAssertionResult[],
): number {
  return computeCorrectnessBreakdown(assertions).score;
}
