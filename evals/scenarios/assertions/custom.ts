// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Custom callback assertion - run arbitrary checks on turn data
 */

import {
  type CustomAssertion,
  type EvalTurnResult,
  type EvalAssertionResult,
} from "../types.ts";

/**
 * Run a custom assertion callback against turn data
 *
 * @param assertion - The custom assertion to evaluate
 * @param turns - All conversation turns
 * @returns Assertion result with pass/fail and details
 */
export function assertCustom(
  assertion: CustomAssertion,
  turns: EvalTurnResult[],
): EvalAssertionResult {
  const maxScore = assertion.score ?? 1;

  try {
    const result = assertion.assert(turns);
    const earned =
      typeof result === "number"
        ? Math.round(Math.max(0, Math.min(1, result)) * maxScore * 100) / 100
        : result
          ? maxScore
          : 0;

    return {
      assertion,
      earned,
      maxScore,
      message:
        earned === maxScore
          ? assertion.description
          : earned > 0
            ? `Partial: ${assertion.description} (${((earned / maxScore) * 100).toFixed(0)}%)`
            : `Failed: ${assertion.description}`,
    };
  } catch (error) {
    return {
      assertion,
      earned: 0,
      maxScore,
      message: `Failed: ${assertion.description} — ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
