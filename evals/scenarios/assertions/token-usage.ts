// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Token usage assertion - informational tracking of token consumption
 * relative to a target budget. Does not contribute to pass/fail scoring.
 */

import { formatTokenLabel } from "../helpers/json-results/assertion-label.ts";
import {
  type TokenUsageAssertion,
  type EvalTurnResult,
  type EvalAssertionResult,
} from "../types.ts";

/**
 * Track token usage relative to a target budget.
 * Returns earned=0, maxScore=0 so it doesn't affect correctness scoring.
 *
 * @param assertion - The token usage assertion to evaluate
 * @param turns - All conversation turns
 * @returns Assertion result with percentage details
 */
export function assertTokenUsage(
  assertion: TokenUsageAssertion,
  turns: EvalTurnResult[],
): EvalAssertionResult {
  const targetTurns =
    assertion.turn == null || assertion.turn === "all"
      ? turns
      : turns.filter((_, i) => i === assertion.turn);

  const total = targetTurns
    .flatMap((t) => t.stepUsages ?? [])
    .reduce((sum, s) => sum + (s[assertion.metric] ?? 0), 0);

  const percentage = Math.round((total / assertion.maxTokens) * 100);

  return {
    assertion,
    earned: 0,
    maxScore: 0,
    message: `${assertion.metric} ${formatTokenLabel(total)} / ${formatTokenLabel(assertion.maxTokens)} target (${percentage}%)`,
    details: { total, target: assertion.maxTokens, percentage },
  };
}
