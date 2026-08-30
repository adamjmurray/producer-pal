// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tally the tool calls that came back as errors.
 */

import { toolCallFailed } from "../../assertions/index.ts";
import { type EvalTurnResult } from "../../types.ts";
import { type JsonToolErrors } from "./types.ts";

/** Error text is only there to identify the failure — keep it short. */
const MESSAGE_LIMIT = 200;

/**
 * Count the failed tool calls across a run and describe each one.
 *
 * A model that hits an error, fixes its arguments and calls again still lands
 * the outcome, so this never decides pass/fail — it feeds the score penalty
 * (see `scorePercentage`) so a clean run outranks a recovered one.
 *
 * @param turns - Completed conversation turns
 * @returns The tally, or undefined when the run made no tool calls at all
 */
export function collectToolErrors(
  turns: EvalTurnResult[],
): JsonToolErrors | undefined {
  const errors: JsonToolErrors["errors"] = [];
  let total = 0;

  for (const turn of turns) {
    for (const call of turn.toolCalls) {
      total++;

      if (!toolCallFailed(call)) continue;

      errors.push({
        turnIndex: turn.turnIndex,
        name: call.name,
        message: (call.result ?? "").slice(0, MESSAGE_LIMIT),
      });
    }
  }

  if (total === 0) return undefined;

  return { count: errors.length, total, errors };
}
