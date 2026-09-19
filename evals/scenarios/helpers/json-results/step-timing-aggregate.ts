// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Roll the per-step generation speeds of one or more turns into a single rate.
 */

import { type EvalTurnResult } from "../../types.ts";
import { type JsonStepTiming } from "./types.ts";

/**
 * Combine the step timings of the given turns.
 *
 * The rate is token-weighted: each step's response time is recovered as
 * `outputTokens / outputTokensPerSecond`, and the totals are divided. Averaging
 * the rates themselves would let a two-token step outvote a thousand-token one.
 * Steps the SDK could not measure drop out of both totals.
 *
 * @param turns - Turns whose steps to combine (pass one turn for a per-turn rate)
 * @returns The combined speeds, or undefined when nothing was measurable
 */
export function aggregateStepTimings(
  turns: EvalTurnResult[],
): JsonStepTiming | undefined {
  let outputTokens = 0;
  let generationSeconds = 0;
  let firstTokenMsTotal = 0;
  let firstTokenSteps = 0;

  for (const turn of turns) {
    const usages = turn.stepUsages ?? [];

    for (const [index, timing] of (turn.stepTimings ?? []).entries()) {
      if (timing.timeToFirstTokenMs != null) {
        firstTokenMsTotal += timing.timeToFirstTokenMs;
        firstTokenSteps++;
      }

      const rate = timing.outputTokensPerSecond;
      const tokens = usages[index]?.outputTokens ?? 0;

      if (rate != null && tokens > 0) {
        outputTokens += tokens;
        generationSeconds += tokens / rate;
      }
    }
  }

  const aggregate: JsonStepTiming = {
    ...(generationSeconds > 0 && {
      outputTokensPerSecond: outputTokens / generationSeconds,
    }),
    ...(firstTokenSteps > 0 && {
      timeToFirstTokenMs: firstTokenMsTotal / firstTokenSteps,
    }),
  };

  return Object.keys(aggregate).length > 0 ? aggregate : undefined;
}
