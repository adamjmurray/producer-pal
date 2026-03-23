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
  try {
    const passed = assertion.assert(turns);

    return {
      assertion,
      earned: passed ? 1 : 0,
      maxScore: 1,
      message: passed
        ? assertion.description
        : `Failed: ${assertion.description}`,
    };
  } catch (error) {
    return {
      assertion,
      earned: 0,
      maxScore: 1,
      message: `Failed: ${assertion.description} — ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
