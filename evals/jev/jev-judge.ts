// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Judge an eval run with Jev: one yes/no question per requirement in the
 * scenario's criteria, plus one for the criteria as a whole. The lowest answer
 * decides: pass, fail, or hand the run to the LLM judge. A separate question
 * checks the replies' claims against the tool calls; it can only turn a pass
 * into an escalation. A graded outcome score rides along in the same request
 * but does not affect the verdict.
 */

import {
  type CheckSummary,
  type TranscriptTurn,
} from "#evals/scenarios/assertions/llm-judge.ts";
import {
  askJev,
  type AskJevOptions,
  type JevNoulQuestion,
  type JevQuestion,
} from "./jev-client.ts";
import { splitRequirements } from "./jev-requirements.ts";
import { buildJevState } from "./jev-state.ts";

// Both tuned on saved eval results against the stored judge.
/** The lowest answer at or above this is a Jev pass. */
export const PASS_THRESHOLD = 0.85;
/** The lowest answer below this is a Jev fail; in between, escalate. */
export const FAIL_THRESHOLD = 0.3;
/**
 * A claims answer below this turns a pass into an escalation. It never causes
 * a fail: real runs with a few loose claims but a good outcome score as low as
 * 0.3. Fabricated claims scored 0.05-0.15; clean runs mostly 0.8-0.95.
 */
export const CLAIMS_THRESHOLD = 0.7;

export interface JevRun {
  turns: TranscriptTurn[];
  checks: CheckSummary[];
}

export interface JevQuestionResult {
  id: string;
  /** "requirement" is one numbered item; "whole" is all the criteria at once;
   *  "claims" checks the replies against the tool calls, whatever the criteria */
  kind: "requirement" | "whole" | "claims";
  /** The requirement text, or the whole criteria */
  text: string;
  /** P(yes) from Jev */
  probability: number;
}

/** The outcome levels, lowest first: the index is the score. */
const OUTCOME_LEVELS = [
  {
    label: "complete failure",
    criterion: "Complete failure: none of what was asked got done",
  },
  {
    label: "mostly failed",
    criterion:
      "Mostly failed: little of what was asked got done, or it went badly wrong",
  },
  {
    label: "partial success",
    criterion:
      "Partial success: some of what was asked got done, with real gaps or problems",
  },
  {
    label: "complete success",
    criterion:
      "Complete success: everything asked got done, and the reply is accurate",
  },
];

const OUTCOME_ID = "outcome";
const CLAIMS_ID = "claims";

/** Kept narrow on purpose: a broad "no hallucinations" question over-failed. */
const CLAIMS_QUESTION = `Every action the assistant's replies say it took (something created, named, renamed, set, changed, moved, deleted, played) is shown in the tool calls and their results. Answer yes only if no reply claims an action that the tool calls do not show.`;

/** A graded 0-3 judgment of the whole run. */
export interface JevOutcome {
  /** 0 (complete failure) to 3 (complete success) */
  score: number;
  confidence: number;
  /** The name of the nearest level */
  label: string;
}

/** "escalate" means too uncertain to call; ask the LLM judge. */
export type JevVerdict = "pass" | "fail" | "escalate";

export interface JevJudgeResult {
  verdict: JevVerdict;
  /** Set when only the claims answer kept a pass from standing */
  escalatedBy?: "claims";
  /** The lowest requirement or whole-criteria answer, which decided pass or
   *  fail (the claims answer is not part of it) */
  minProbability: number;
  questions: JevQuestionResult[];
  /** Graded outcome; not part of the verdict */
  outcome: JevOutcome;
  /** The model version that answered, as the route reports it */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Actual cost in USD, when the route reports it */
  cost?: number;
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
  const questions: Record<string, JevQuestion> = {};

  for (const q of planned) {
    questions[q.id] = {
      type: "noul",
      instructions: q.instructions,
    } satisfies JevNoulQuestion;
  }

  questions[OUTCOME_ID] = buildOutcomeQuestion(criteria);

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

  const outcomeAnswer = response.answers[OUTCOME_ID];

  if (outcomeAnswer?.type !== "score") {
    throw new Error("Jev gave no outcome score");
  }

  const minProbability = Math.min(
    ...results.filter((r) => r.kind !== "claims").map((r) => r.probability),
  );

  const verdict = decideVerdict(minProbability, claimsProbability(results));

  return {
    verdict,
    ...(verdict === "escalate" &&
      minProbability >= PASS_THRESHOLD && { escalatedBy: "claims" as const }),
    minProbability,
    questions: results,
    outcome: {
      score: outcomeAnswer.score,
      confidence: outcomeAnswer.confidence,
      label: outcomeLabel(outcomeAnswer.score),
    },
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cost: response.usage.cost,
    truncated,
  };
}

/**
 * Build the graded question asked alongside the yes/no ones.
 *
 * @param criteria - The scenario's llm_judge prompt
 * @returns A score question with one level per outcome
 */
export function buildOutcomeQuestion(criteria: string): JevQuestion {
  return {
    type: "score",
    instructions: `Scenario expectations:\n${criteria.trim()}\n\nOverall, how did the assistant do against these expectations?`,
    criteria: OUTCOME_LEVELS.map((l) => l.criterion),
  };
}

/**
 * Name the outcome level nearest a score.
 *
 * @param score - 0 to 3, fractional allowed
 * @returns The short level name
 */
export function outcomeLabel(score: number): string {
  const top = OUTCOME_LEVELS.length - 1;
  const level = Math.min(top, Math.max(0, Math.round(score)));

  return OUTCOME_LEVELS[level]?.label ?? "unknown";
}

/**
 * Turn the lowest answer into a verdict.
 *
 * @param minProbability - The lowest P(yes) over the requirement and whole questions
 * @param claims - P(yes) of the claims question, when it was asked
 * @returns Pass, fail, or escalate when in between (or when a pass has doubtful claims)
 */
export function decideVerdict(
  minProbability: number,
  claims?: number,
): JevVerdict {
  if (minProbability >= PASS_THRESHOLD) {
    return claims != null && claims < CLAIMS_THRESHOLD ? "escalate" : "pass";
  }

  return minProbability < FAIL_THRESHOLD ? "fail" : "escalate";
}

/**
 * Say why an escalated run was too close to call.
 *
 * @param questions - Jev's answers
 * @param minProbability - The lowest requirement or whole-criteria P(yes)
 * @returns A one-line reason naming the lowest question
 */
export function escalationReason(
  questions: Pick<JevQuestionResult, "id" | "kind" | "probability">[],
  minProbability: number,
): string {
  const claims = claimsProbability(questions);

  if (minProbability >= PASS_THRESHOLD && claims != null) {
    return `claims answer ${claims.toFixed(2)} is below ${CLAIMS_THRESHOLD}`;
  }

  const lowest = questions.find(
    (q) => q.kind !== "claims" && q.probability === minProbability,
  );

  return `lowest answer ${minProbability.toFixed(2)} (${lowest?.id ?? "?"}) is between ${FAIL_THRESHOLD} and ${PASS_THRESHOLD}`;
}

/**
 * Find the claims answer among the answers.
 *
 * @param questions - Jev's answers
 * @returns P(yes) of the claims question, or undefined when it was not asked
 */
export function claimsProbability(
  questions: Pick<JevQuestionResult, "kind" | "probability">[],
): number | undefined {
  return questions.find((q) => q.kind === "claims")?.probability;
}

interface PlannedQuestion extends Omit<JevQuestionResult, "probability"> {
  instructions: string;
}

/**
 * Build the questions to ask: one per numbered requirement (or one for the
 * whole prompt when there is no list), one for the criteria as a whole, and
 * the claims question.
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

  planned.push(
    {
      id: "whole",
      kind: "whole",
      text: criteria.trim(),
      instructions: `${criteria.trim()}\n\nDid the assistant meet these expectations?`,
    },
    {
      id: CLAIMS_ID,
      kind: "claims",
      text: CLAIMS_QUESTION,
      instructions: CLAIMS_QUESTION,
    },
  );

  return planned;
}
