// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reads what Jev answered during a `--jev` run, so a comparison can use the
 * answer the run recorded instead of calling Jev again.
 */

import { type JsonEvalResult } from "#evals/scenarios/helpers/json-results/types.ts";
import { buildQuestions, type JevJudgeResult } from "./jev-judge.ts";

/**
 * Rebuild Jev's answer from a saved `--jev` result.
 *
 * @param result - A saved result
 * @param criteria - The scenario's current llm_judge prompt, for question text
 * @returns The answer, an error message when Jev's call failed in the run, or
 *   undefined when the result has no recorded Jev answer
 */
export function recordedJev(
  result: JsonEvalResult,
  criteria: string,
): { jev: JevJudgeResult } | { error: string } | undefined {
  const saved = result.judge?.jev;

  if (saved == null) {
    return undefined;
  }

  if (saved.verdict === "error") {
    return { error: saved.escalationReason };
  }

  const texts = new Map(buildQuestions(criteria).map((q) => [q.id, q.text]));

  return {
    jev: {
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
