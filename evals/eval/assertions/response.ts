// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Response assertion - text/regex matching on assistant responses
 */

import type {
  ResponseContainsAssertion,
  EvalTurnResult,
  EvalAssertionResult,
} from "../types.ts";
import { getTargetTurns } from "./helpers.ts";

/**
 * Assert that the response contains (or doesn't contain) a pattern
 *
 * @param assertion - The response contains assertion
 * @param turns - All conversation turns
 * @returns Assertion result with pass/fail and details
 */
export function assertResponseContains(
  assertion: ResponseContainsAssertion,
  turns: EvalTurnResult[],
): EvalAssertionResult {
  const targetTurns = getTargetTurns(turns, assertion.turn);

  const pattern =
    typeof assertion.pattern === "string"
      ? new RegExp(escapeRegex(assertion.pattern), "i")
      : assertion.pattern;

  const matchingTurns = targetTurns.filter((t) =>
    pattern.test(t.assistantResponse),
  );

  const found = matchingTurns.length > 0;
  const shouldFind = !assertion.negate;
  const passed = found === shouldFind;

  const patternDesc =
    typeof assertion.pattern === "string"
      ? `"${assertion.pattern}"`
      : assertion.pattern.toString();

  const negateDesc = assertion.negate ? "not " : "";

  return {
    assertion,
    passed,
    message: passed
      ? `Response ${negateDesc}contains ${patternDesc}`
      : `Expected response to ${negateDesc}contain ${patternDesc}`,
    details: {
      pattern: patternDesc,
      found,
      matchingTurnIndices: matchingTurns.map((t) => t.turnIndex),
    },
  };
}

/**
 * Escape special regex characters in a string
 *
 * @param str - String to escape
 * @returns Escaped string safe for use in RegExp
 */
function escapeRegex(str: string): string {
  return str.replaceAll(/[$()*+.?[\\\]^{|}]/g, "\\$&");
}
