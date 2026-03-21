// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Token usage assertion - verify token consumption stays within budget
 */

import {
  type TokenUsageAssertion,
  type EvalTurnResult,
  type EvalAssertionResult,
} from "../types.ts";

/**
 * Assert that token usage stays within a budget
 *
 * @param assertion - The token usage assertion to evaluate
 * @param turns - All conversation turns
 * @returns Assertion result with pass/fail or partial score
 */
export function assertTokenUsage(
  assertion: TokenUsageAssertion,
  turns: EvalTurnResult[],
): EvalAssertionResult {
  const maxScore = assertion.score ?? 1;
  const targetTurns =
    assertion.turn == null || assertion.turn === "all"
      ? turns
      : turns.filter((_, i) => i === assertion.turn);

  const total = targetTurns
    .flatMap((t) => t.stepUsages ?? [])
    .reduce((sum, s) => sum + (s[assertion.metric] ?? 0), 0);

  const label = `${assertion.metric} ${formatTokenCount(total)}`;

  if (assertion.upperLimit == null) {
    // Hard pass/fail
    const passed = total <= assertion.maxTokens;

    return {
      assertion,
      earned: passed ? maxScore : 0,
      maxScore,
      message: passed
        ? `${label} ≤ ${formatTokenCount(assertion.maxTokens)}`
        : `${label} exceeds ${formatTokenCount(assertion.maxTokens)}`,
    };
  }

  // Graduated scoring
  if (total <= assertion.maxTokens) {
    return {
      assertion,
      earned: maxScore,
      maxScore,
      message: `${label} ≤ ${formatTokenCount(assertion.maxTokens)}`,
    };
  }

  if (total >= assertion.upperLimit) {
    return {
      assertion,
      earned: 0,
      maxScore,
      message: `${label} exceeds ${formatTokenCount(assertion.upperLimit)}`,
    };
  }

  const fraction =
    1 -
    (total - assertion.maxTokens) /
      (assertion.upperLimit - assertion.maxTokens);
  const earned = Math.round(fraction * maxScore * 100) / 100;

  return {
    assertion,
    earned,
    maxScore,
    message: `${label} (budget ${formatTokenCount(assertion.maxTokens)}–${formatTokenCount(assertion.upperLimit)})`,
  };
}

/**
 * Format a token count for display (e.g. 20000 → "20k", 1500 → "1.5k")
 *
 * @param count - Token count
 * @returns Formatted string
 */
function formatTokenCount(count: number): string {
  if (count >= 1000) {
    const k = count / 1000;

    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
  }

  return String(count);
}
