// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reads what the decider answered during a `--decider` run, so a comparison can use the
 * answer the run recorded instead of calling the decider again.
 */

import { type JsonEvalResult } from "#evals/scenarios/helpers/json-results/types.ts";
import { type DeciderProvider } from "./decider-provider.ts";
import { buildQuestions, type DeciderJudgeResult } from "./decider-judge.ts";

/**
 * Rebuild the decider's answer from a saved `--decider` result.
 *
 * @param result - A saved result
 * @param criteria - The scenario's current llm_judge prompt, for question text
 * @returns The answer, an error message when the decider's call failed in the run, or
 *   undefined when the result has no recorded decider answer
 */
export function recordedDecider(
  result: JsonEvalResult,
  criteria: string,
): { decider: DeciderJudgeResult } | { error: string } | undefined {
  const saved = result.judge?.decider;

  if (saved == null) {
    return undefined;
  }

  if (saved.verdict === "error") {
    return { error: saved.escalationReason };
  }

  const texts = new Map(buildQuestions(criteria).map((q) => [q.id, q.text]));

  return {
    decider: {
      provider: saved.provider as DeciderProvider,
      verdict: saved.verdict,
      ...(saved.escalatedBy != null && { escalatedBy: saved.escalatedBy }),
      minProbability: saved.minProbability,
      questions: saved.questions.map((q) => ({
        ...q,
        text: texts.get(q.id) ?? "",
        probability: q.probability,
      })),
      outcome: {
        score: saved.outcome.score,
        maxScore: saved.outcome.maxScore,
        confidence: saved.outcome.confidence,
        label: saved.outcome.level,
      },
      model: saved.model,
      inputTokens: saved.inputTokens,
      outputTokens: saved.outputTokens,
      ...(saved.cost != null && { cost: saved.cost }),
      truncated: saved.truncated,
    },
  };
}
