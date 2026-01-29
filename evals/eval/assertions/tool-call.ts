/**
 * Tool call assertion - verify specific tools were called with expected args
 */

import type {
  ToolCallAssertion,
  EvalTurnResult,
  EvalAssertionResult,
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

  const matchingCalls = targetTurns
    .flatMap((t) => t.toolCalls)
    .filter((tc) => tc.name === assertion.tool)
    .filter(
      (tc) => assertion.args == null || exactMatch(tc.args, assertion.args),
    );

  const count = matchingCalls.length;
  const expectedCount = normalizeCount(assertion.count);

  const passed =
    count >= expectedCount.min &&
    (expectedCount.max == null || count <= expectedCount.max);

  const argsDesc = assertion.args
    ? ` with args matching ${JSON.stringify(assertion.args)}`
    : "";

  return {
    assertion,
    passed,
    message: passed
      ? `Tool ${assertion.tool} called ${count} time(s)${argsDesc}`
      : `Expected ${assertion.tool} to be called ${formatExpectedCount(expectedCount)}${argsDesc}, got ${count}`,
    details: { matchingCalls, count, expectedCount },
  };
}
