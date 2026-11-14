// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Judge an eval run with the decider: one yes/no question per requirement in the
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
  askDecider,
  type AskDeciderOptions,
  type DeciderNoulQuestion,
  type DeciderQuestion,
} from "./decider-client.ts";
import { splitRequirements } from "./decider-requirements.ts";
import {
  DECIDER_PROVIDERS,
  resolveDecider,
  type DeciderProvider,
  type DeciderProviderInfo,
} from "./decider-provider.ts";
import { buildDeciderState, type BuiltDeciderState } from "./decider-state.ts";

// Both tuned on saved eval results against the stored judge.
/** The lowest answer at or above this is a decider pass. */
export const PASS_THRESHOLD = 0.85;
/** The lowest answer below this is a decider fail; in between, escalate. */
export const FAIL_THRESHOLD = 0.3;
/**
 * A claims answer below this turns a pass into an escalation. It never causes
 * a fail: real runs with a few loose claims but a good outcome score as low as
 * 0.3. Fabricated claims scored 0.05-0.15; clean runs mostly 0.8-0.95.
 */
export const CLAIMS_THRESHOLD = 0.7;

export interface DeciderRun {
  turns: TranscriptTurn[];
  checks: CheckSummary[];
}

export interface DeciderQuestionResult {
  id: string;
  /** "requirement" is one numbered item; "whole" is all the criteria at once;
   *  "claims" checks the replies against the tool calls, whatever the criteria */
  kind: "requirement" | "whole" | "claims";
  /** The requirement text, or the whole criteria */
  text: string;
  /** P(yes) from the decider */
  probability: number;
}

/**
 * The outcome levels, lowest first: the index is the score. Every decider gets
 * the same six (autotrust-jev refuses any other count), so scores compare.
 */
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
    label: "major gaps",
    criterion:
      "Partial success with major gaps: some of what was asked got done, but important parts are missing or wrong",
  },
  {
    label: "minor gaps",
    criterion:
      "Partial success with minor gaps: most of what was asked got done, with small gaps or problems",
  },
  {
    label: "near-complete success",
    criterion:
      "Near-complete success: everything asked got done, with a small inaccuracy in the reply",
  },
  {
    label: "complete success",
    criterion:
      "Complete success: everything asked got done, and the reply is accurate",
  },
];

/** The top score of the outcome scale; results saved before it was recorded used 3. */
export const OUTCOME_MAX_SCORE = OUTCOME_LEVELS.length - 1;

const OUTCOME_ID = "outcome";
const MAX_FIT_ATTEMPTS = 4;
const CLAIMS_ID = "claims";

/** Kept narrow on purpose: a broad "no hallucinations" question over-failed. */
const CLAIMS_QUESTION = `Every action the assistant's replies say it took (something created, named, renamed, set, changed, moved, deleted, played) is shown in the tool calls and their results. Answer yes only if no reply claims an action that the tool calls do not show.`;

/** A graded judgment of the whole run. */
export interface DeciderOutcome {
  /** 0 (complete failure) to `maxScore` (complete success) */
  score: number;
  /** The top of the scale this score is on */
  maxScore: number;
  confidence: number;
  /** The name of the nearest level */
  label: string;
}

/** "escalate" means too uncertain to call; ask the LLM judge. */
export type DeciderVerdict = "pass" | "fail" | "escalate";

export interface DeciderJudgeResult {
  /** Which provider answered */
  provider: DeciderProvider;
  verdict: DeciderVerdict;
  /** Set when only the claims answer kept a pass from standing */
  escalatedBy?: "claims";
  /** The lowest requirement or whole-criteria answer, which decided pass or
   *  fail (the claims answer is not part of it) */
  minProbability: number;
  questions: DeciderQuestionResult[];
  /** Graded outcome; not part of the verdict */
  outcome: DeciderOutcome;
  /** The model that answered, as the provider reports it */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Actual cost in USD, when the provider reports it */
  cost?: number;
  /** True when the transcript had to be cut to fit */
  truncated: boolean;
}

/**
 * Re-judge a run with the decider.
 *
 * @param run - The run's turns and deterministic check results
 * @param criteria - The scenario's llm_judge prompt
 * @param options - Passed to the decider client
 * @returns Per-question probabilities, the verdict and token usage
 */
export async function deciderJudge(
  run: DeciderRun,
  criteria: string,
  options?: AskDeciderOptions,
): Promise<DeciderJudgeResult> {
  const { provider } = resolveDecider(options, options?.apiKey);
  const planned = buildQuestions(criteria);
  const questions: Record<string, DeciderQuestion> = {};

  for (const q of planned) {
    questions[q.id] = {
      type: "noul",
      instructions: q.instructions,
    } satisfies DeciderNoulQuestion;
  }

  questions[OUTCOME_ID] = buildOutcomeQuestion(criteria);

  const { state, truncated } = buildFittingState(run, questions, provider);
  const response = await askDecider(state, questions, options);
  const results = planned.map((q): DeciderQuestionResult => {
    const answer = response.answers[q.id];

    if (answer?.type !== "noul") {
      throw new Error(`Decider gave no yes/no answer for question "${q.id}"`);
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
    throw new Error("Decider gave no outcome score");
  }

  const minProbability = Math.min(
    ...results.filter((r) => r.kind !== "claims").map((r) => r.probability),
  );

  const verdict = decideVerdict(minProbability, claimsProbability(results));

  return {
    provider,
    verdict,
    ...(verdict === "escalate" &&
      minProbability >= PASS_THRESHOLD && { escalatedBy: "claims" as const }),
    minProbability,
    questions: results,
    outcome: {
      score: outcomeAnswer.score,
      maxScore: OUTCOME_MAX_SCORE,
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
 * Build the state, cut to what the provider accepts. A provider that caps the
 * whole request in bytes gets the state cut again if the questions and
 * multi-byte text push it over.
 *
 * @param run - The run's turns and deterministic check results
 * @param questions - The questions that go with the state
 * @param provider - The provider that will answer
 * @returns The state and whether anything was cut
 */
function buildFittingState(
  run: DeciderRun,
  questions: Record<string, DeciderQuestion>,
  provider: DeciderProvider,
): BuiltDeciderState {
  const { maxStateChars, maxRequestBytes: maxBytes }: DeciderProviderInfo =
    DECIDER_PROVIDERS[provider];
  let chars = maxStateChars;
  let built = buildDeciderState(run.turns, run.checks, chars);

  if (maxBytes == null) {
    return built;
  }

  for (let attempt = 0; attempt < MAX_FIT_ATTEMPTS; attempt++) {
    const bytes = Buffer.byteLength(
      JSON.stringify({ state: built.state, questions }),
    );

    if (bytes <= maxBytes) {
      break;
    }

    chars = Math.floor(chars * (maxBytes / bytes) * 0.95);
    built = buildDeciderState(run.turns, run.checks, chars);
  }

  return built;
}

/**
 * Build the graded question asked alongside the yes/no ones.
 *
 * @param criteria - The scenario's llm_judge prompt
 * @returns A score question with one level per outcome
 */
export function buildOutcomeQuestion(criteria: string): DeciderQuestion {
  return {
    type: "score",
    instructions: `Scenario expectations:\n${criteria.trim()}\n\nOverall, how did the assistant do against these expectations?`,
    criteria: OUTCOME_LEVELS.map((l) => l.criterion),
  };
}

/**
 * Name the outcome level nearest a score.
 *
 * @param score - 0 to `OUTCOME_MAX_SCORE`, fractional allowed
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
): DeciderVerdict {
  if (minProbability >= PASS_THRESHOLD) {
    return claims != null && claims < CLAIMS_THRESHOLD ? "escalate" : "pass";
  }

  return minProbability < FAIL_THRESHOLD ? "fail" : "escalate";
}

/**
 * Say why an escalated run was too close to call.
 *
 * @param questions - The decider's answers
 * @param minProbability - The lowest requirement or whole-criteria P(yes)
 * @returns A one-line reason naming the lowest question
 */
export function escalationReason(
  questions: Pick<DeciderQuestionResult, "id" | "kind" | "probability">[],
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
 * @param questions - The decider's answers
 * @returns P(yes) of the claims question, or undefined when it was not asked
 */
export function claimsProbability(
  questions: Pick<DeciderQuestionResult, "kind" | "probability">[],
): number | undefined {
  return questions.find((q) => q.kind === "claims")?.probability;
}

interface PlannedQuestion extends Omit<DeciderQuestionResult, "probability"> {
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
