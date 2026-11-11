// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Decider-first judging (`--jev`): the decider answers first. A clear pass or fail stands;
 * when the decider is unsure, or its call fails, the LLM judge decides as it does
 * without the flag.
 */

import { type DeciderRoute } from "#evals/decider/decider-client.ts";
import {
  escalationReason,
  FAIL_THRESHOLD,
  deciderJudge,
  type DeciderJudgeResult,
} from "#evals/decider/decider-judge.ts";
import {
  type JudgeDecidedBy,
  type JsonDeciderJudgment,
  type JsonLlmVerdict,
} from "../json-results/types.ts";
import {
  type EvalAssertionResult,
  type EvalProvider,
  type EvalTurnResult,
  type LlmJudgeAssertion,
} from "../../types.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  assertWithLlmJudge,
  type CheckSummary,
  type LlmJudgeDetails,
  type LlmJudgeOverride,
} from "../../assertions/llm-judge.ts";

/** Which the decider route and model the judge calls use. */
export interface DeciderSettings {
  route: DeciderRoute;
  /** Defaults to the client's default (`jev-latest`) */
  model?: string;
}

/** Test seams: the decider and LLM judge calls. */
export interface DeciderFirstDeps {
  decider?: typeof deciderJudge;
  llm?: typeof assertWithLlmJudge;
}

/** The judge details a `--jev` run records. */
export interface DeciderFirstDetails extends LlmJudgeDetails {
  decidedBy: JudgeDecidedBy;
  decider: JsonDeciderJudgment;
  /** The LLM judge's verdict, when it ran */
  llm?: JsonLlmVerdict;
}

/**
 * Judge with the decider first, falling back to the LLM judge.
 *
 * @param assertion - The LLM judge assertion
 * @param turns - All conversation turns
 * @param defaultProvider - Default provider from scenario
 * @param cliOverride - Optional CLI override for the LLM judge
 * @param checkSummaries - Deterministic check results for the judge to see
 * @param settings - The decider route and model
 * @param deps - Test seams
 * @returns Assertion result; `details` is a `DeciderFirstDetails`
 */
export async function assertWithDeciderFirst(
  assertion: LlmJudgeAssertion,
  turns: EvalTurnResult[],
  defaultProvider: EvalProvider,
  cliOverride: LlmJudgeOverride | undefined,
  checkSummaries: CheckSummary[] | undefined,
  settings: DeciderSettings,
  deps: DeciderFirstDeps = {},
): Promise<EvalAssertionResult> {
  const askDecider = deps.decider ?? deciderJudge;
  const askLlm = deps.llm ?? assertWithLlmJudge;
  let answer: DeciderJudgeResult | undefined;
  let judgment: JsonDeciderJudgment;

  try {
    answer = await askDecider(
      { turns, checks: checkSummaries ?? [] },
      assertion.prompt,
      { route: settings.route, model: settings.model },
    );
    judgment = toJudgment(answer, settings.route);
  } catch (error) {
    judgment = {
      route: settings.route,
      verdict: "error",
      escalationReason: `decider call failed: ${errorMessage(error)}`,
    };
  }

  if (answer != null && judgment.verdict !== "escalate") {
    return deciderDecided(assertion, answer, judgment);
  }

  const llm = await askLlm(
    assertion,
    turns,
    defaultProvider,
    cliOverride,
    checkSummaries,
  );
  const llmDetails = llm.details as LlmJudgeDetails;
  const details: DeciderFirstDetails = {
    ...llmDetails,
    decidedBy: "llm",
    decider: judgment,
    llm: {
      pass: llmDetails.pass,
      issues: llmDetails.issues,
      ...(llmDetails.provider != null && { provider: llmDetails.provider }),
      ...(llmDetails.model != null && { model: llmDetails.model }),
    },
  };

  return {
    ...llm,
    message: `The decider escalated (${judgment.escalationReason}); ${llm.message}`,
    details,
  };
}

/**
 * Build the result when the decider's pass or fail stands.
 *
 * @param assertion - The judge assertion
 * @param answer - The decider's answer
 * @param judgment - The recordable form of the answer
 * @returns Assertion result with no score contribution
 */
function deciderDecided(
  assertion: LlmJudgeAssertion,
  answer: DeciderJudgeResult,
  judgment: JsonDeciderJudgment,
): EvalAssertionResult {
  const pass = answer.verdict === "pass";
  const issues = pass ? [] : unmetRequirements(answer);
  const details: DeciderFirstDetails = {
    pass,
    issues,
    decidedBy: "decider",
    decider: judgment,
  };

  return {
    assertion,
    earned: 0,
    maxScore: 0,
    message: pass
      ? "The decider judge: pass"
      : `The decider judge: fail (${issues.length} unmet)`,
    details,
  };
}

/**
 * Name the questions the decider answered "no" to, as the fail's issues.
 *
 * @param answer - The decider's answer
 * @returns One issue per question below the fail threshold
 */
function unmetRequirements(answer: DeciderJudgeResult): string[] {
  return answer.questions
    .filter((q) => q.probability < FAIL_THRESHOLD)
    .map((q) => {
      const text =
        q.kind === "requirement"
          ? truncate(q.text)
          : q.kind === "whole"
            ? "the criteria as a whole"
            : "replies claim actions the tool calls do not show";

      return `The decider: not met (P=${q.probability.toFixed(2)}): ${text}`;
    });
}

/**
 * Cut a long requirement for an issue line.
 *
 * @param text - The requirement text
 * @returns The text, shortened past 200 characters
 */
function truncate(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}...` : text;
}

/**
 * Convert the decider's answer to the form saved in results.
 *
 * @param answer - The decider's answer
 * @param route - The route it came through
 * @returns The saved form
 */
function toJudgment(
  answer: DeciderJudgeResult,
  route: DeciderRoute,
): JsonDeciderJudgment {
  return {
    route,
    verdict: answer.verdict,
    ...(answer.verdict === "escalate" && {
      escalationReason: escalationReason(
        answer.questions,
        answer.minProbability,
      ),
    }),
    ...(answer.escalatedBy != null && { escalatedBy: answer.escalatedBy }),
    model: answer.model,
    minProbability: answer.minProbability,
    questions: answer.questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      probability: q.probability,
    })),
    outcome: {
      score: answer.outcome.score,
      level: answer.outcome.label,
      confidence: answer.outcome.confidence,
    },
    inputTokens: answer.inputTokens,
    outputTokens: answer.outputTokens,
    ...(answer.cost != null && { cost: answer.cost }),
    truncated: answer.truncated,
  };
}
