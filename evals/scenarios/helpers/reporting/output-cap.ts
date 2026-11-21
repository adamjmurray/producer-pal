// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Spot model calls that stopped because they ran out of output tokens.
 *
 * Reasoning counts against the cap, so a long-thinking model can be cut off
 * mid-reply or mid tool call. That fails the scenario on the harness, not the
 * model, so the reports flag it.
 */

import { type JsonEvalResult } from "../json-results/types.ts";

/** Finish reasons that mean the output cap cut the turn off: the AI SDK's
 *  `length` and the Claude Code CLI's `max_tokens`. */
const CAP_FINISH_REASONS = new Set(["length", "max_tokens"]);

/** Tells the reader what to do about a capped turn. */
export const OUTPUT_CAP_HINT = "raise it with --output-tokens";

/**
 * The turns of a run that ended on the output cap.
 *
 * @param result - A single trial result
 * @returns Their turn indexes, empty when none hit it
 */
export function outputCapTurns(result: JsonEvalResult): number[] {
  return result.turns
    .filter(
      (t) => t.finishReason != null && CAP_FINISH_REASONS.has(t.finishReason),
    )
    .map((t) => t.turnIndex);
}

/**
 * How many turns across several trials ended on the output cap.
 *
 * @param results - Trial results
 * @returns The total turn count
 */
export function outputCapCount(results: JsonEvalResult[]): number {
  return results.reduce((sum, r) => sum + outputCapTurns(r).length, 0);
}
