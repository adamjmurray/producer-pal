// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tool call assertion - verify specific tools were called with expected args
 */

import {
  type ToolCallAssertion,
  type EvalTurnResult,
  type EvalAssertionResult,
} from "../types.ts";
import {
  exactMatch,
  formatExpectedCount,
  getTargetTurns,
  normalizeCount,
} from "./helpers.ts";

/**
 * Assert that a tool was called with expected arguments
 *
 * @param assertion - The tool call assertion to evaluate
 * @param turns - All conversation turns
 * @returns Assertion result with pass/fail and details
 */
export function assertToolCalled(
  assertion: ToolCallAssertion,
  turns: EvalTurnResult[],
): EvalAssertionResult {
  const targetTurns = getTargetTurns(turns, assertion.turn);

  // First filter by name only (for correctness scoring)
  const nameMatchingCalls = targetTurns
    .flatMap((t) => t.toolCalls)
    .filter((tc) => tc.name === assertion.tool);

  // Then filter by args
  const matchingCalls = nameMatchingCalls.filter(
    (tc) => assertion.args == null || exactMatch(tc.args, assertion.args),
  );

  const count = matchingCalls.length;
  const expectedCount = normalizeCount(assertion.count);

  const passed =
    count >= expectedCount.min &&
    (expectedCount.max == null || count <= expectedCount.max);

  const maxScore = assertion.score ?? 1;

  const argsDesc = assertion.args
    ? ` with args matching ${JSON.stringify(assertion.args)}`
    : "";

  return {
    assertion,
    earned: passed ? maxScore : 0,
    maxScore,
    message: passed
      ? `Tool ${assertion.tool} called ${count} time(s)${argsDesc}`
      : `Expected ${assertion.tool} to be called ${formatExpectedCount(expectedCount)}${argsDesc}, got ${count}`,
    details: {
      matchingCalls,
      count,
      expectedCount,
      nameMatchCount: nameMatchingCalls.length,
      argsSpecified: assertion.args != null,
    },
  };
}
