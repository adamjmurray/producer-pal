// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Judge an eval run with Jev: one yes/no question per requirement in the
 * scenario's criteria, plus one for the criteria as a whole. The lowest answer
 * decides: pass, fail, or hand the run to the LLM judge.
 */

import {
  type CheckSummary,
  type TranscriptTurn,
} from "#evals/scenarios/assertions/llm-judge.ts";
import {
  askJev,
  type AskJevOptions,
  type JevNoulQuestion,
} from "./jev-client.ts";
import { splitRequirements } from "./jev-requirements.ts";
import { buildJevState } from "./jev-state.ts";

// Both tuned on saved eval results against the stored judge.
/** The lowest answer at or above this is a Jev pass. */
export const PASS_THRESHOLD = 0.85;
/** The lowest answer below this is a Jev fail; in between, escalate. */
export const FAIL_THRESHOLD = 0.3;

export interface JevRun {
  turns: TranscriptTurn[];
  checks: CheckSummary[];
}

export interface JevQuestionResult {
  id: string;
  /** "requirement" is one numbered item; "whole" is all the criteria at once */
  kind: "requirement" | "whole";
  /** The requirement text, or the whole criteria */
  text: string;
  /** P(yes) from Jev */
  probability: number;
}

/** "escalate" means too uncertain to call; ask the LLM judge. */
export type JevVerdict = "pass" | "fail" | "escalate";

export interface JevJudgeResult {
  verdict: JevVerdict;
  /** The lowest answer, which decided the verdict */
  minProbability: number;
  questions: JevQuestionResult[];
  inputTokens: number;
  outputTokens: number;
  /** True when the transcript had to be cut to fit */
  truncated: boolean;
}

/**
 * Re-judge a run with Jev.
 *
 * @param run - The run's turns and deterministic check results
 * @param criteria - The scenario's llm_judge prompt
 * @param options - Passed to the Jev client
 * @returns Per-question probabilities, the verdict and token usage
 */
export async function jevJudge(
  run: JevRun,
  criteria: string,
  options?: AskJevOptions,
): Promise<JevJudgeResult> {
  const { state, truncated } = buildJevState(run.turns, run.checks);
  const planned = buildQuestions(criteria);
  const questions: Record<string, JevNoulQuestion> = {};

  for (const q of planned) {
    questions[q.id] = { type: "noul", instructions: q.instructions };
  }

  const response = await askJev(state, questions, options);
  const results = planned.map((q): JevQuestionResult => {
    const answer = response.answers[q.id];

    if (answer?.type !== "noul") {
      throw new Error(`Jev gave no yes/no answer for question "${q.id}"`);
    }

    return {
      id: q.id,
      kind: q.kind,
      text: q.text,
      probability: answer.noul,
    };
  });

  const minProbability = Math.min(...results.map((r) => r.probability));

  return {
    verdict: decideVerdict(minProbability),
    minProbability,
    questions: results,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    truncated,
  };
}

/**
 * Turn the lowest answer into a verdict.
 *
 * @param minProbability - The lowest P(yes) over all questions
 * @returns Pass, fail, or escalate when in between
 */
export function decideVerdict(minProbability: number): JevVerdict {
  if (minProbability >= PASS_THRESHOLD) {
    return "pass";
  }

  return minProbability < FAIL_THRESHOLD ? "fail" : "escalate";
}

interface PlannedQuestion extends Omit<JevQuestionResult, "probability"> {
  instructions: string;
}

/**
 * Build the questions to ask: one per numbered requirement (or one for the
 * whole prompt when there is no list), then one for the criteria as a whole.
 *
 * @param criteria - The scenario's llm_judge prompt
 * @returns Questions with ids and instruction text
 */
export function buildQuestions(criteria: string): PlannedQuestion[] {
  const { context, items, trailer } = splitRequirements(criteria);
  const planned: PlannedQuestion[] = [];

  if (items.length === 0) {
    planned.push({
      id: "req1",
      kind: "requirement",
      text: criteria.trim(),
      instructions: `${criteria.trim()}\n\nDid the assistant meet these expectations?`,
    });
  }

  for (const [i, item] of items.entries()) {
    const parts = [context, `Requirement: ${item}`, trailer].filter(
      (p) => p !== "",
    );

    planned.push({
      id: `req${i + 1}`,
      kind: "requirement",
      text: item,
      instructions: `${parts.join("\n\n")}\n\nDid the assistant satisfy this requirement?`,
    });
  }

  planned.push({
    id: "whole",
    kind: "whole",
    text: criteria.trim(),
    instructions: `${criteria.trim()}\n\nDid the assistant meet these expectations?`,
  });

  return planned;
}
