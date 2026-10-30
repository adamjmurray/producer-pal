// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Jev-first judging (`--jev`): Jev answers first. A clear pass or fail stands;
 * when Jev is unsure, or its call fails, the LLM judge decides as it does
 * without the flag.
 */

import { type JevRoute } from "#evals/jev/jev-client.ts";
import {
  escalationReason,
  FAIL_THRESHOLD,
  jevJudge,
  type JevJudgeResult,
} from "#evals/jev/jev-judge.ts";
import {
  type JudgeDecider,
  type JsonJevJudgment,
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
} from "../../assertions/llm-judge.ts";

/** Which Jev route and model the judge calls use. */
export interface JevSettings {
  route: JevRoute;
  /** Defaults to the client's default (`jev-latest`) */
  model?: string;
}

/** Test seams: the Jev and LLM judge calls. */
export interface JevFirstDeps {
  jev?: typeof jevJudge;
  llm?: typeof assertWithLlmJudge;
}

/** The judge details a `--jev` run records. */
export interface JevFirstDetails extends LlmJudgeDetails {
  decidedBy: JudgeDecider;
  jev: JsonJevJudgment;
  /** The LLM judge's verdict, when it ran */
  llm?: JsonLlmVerdict;
}

/**
 * Judge with Jev first, falling back to the LLM judge.
 *
 * @param assertion - The LLM judge assertion
 * @param turns - All conversation turns
 * @param defaultProvider - Default provider from scenario
 * @param cliOverride - Optional CLI override for the LLM judge
 * @param checkSummaries - Deterministic check results for the judge to see
 * @param settings - Jev route and model
 * @param deps - Test seams
 * @returns Assertion result; `details` is a `JevFirstDetails`
 */
export async function assertWithJevFirst(
  assertion: LlmJudgeAssertion,
  turns: EvalTurnResult[],
  defaultProvider: EvalProvider,
  cliOverride: { provider?: EvalProvider; model?: string } | undefined,
  checkSummaries: CheckSummary[] | undefined,
  settings: JevSettings,
  deps: JevFirstDeps = {},
): Promise<EvalAssertionResult> {
  const askJev = deps.jev ?? jevJudge;
  const askLlm = deps.llm ?? assertWithLlmJudge;
  let answer: JevJudgeResult | undefined;
  let judgment: JsonJevJudgment;

  try {
    answer = await askJev(
      { turns, checks: checkSummaries ?? [] },
      assertion.prompt,
      { route: settings.route, model: settings.model },
    );
    judgment = toJudgment(answer, settings.route);
  } catch (error) {
    judgment = {
      route: settings.route,
      verdict: "error",
      escalationReason: `Jev call failed: ${errorMessage(error)}`,
    };
  }

  if (answer != null && judgment.verdict !== "escalate") {
    return jevDecided(assertion, answer, judgment);
  }

  const llm = await askLlm(
    assertion,
    turns,
    defaultProvider,
    cliOverride,
    checkSummaries,
  );
  const llmDetails = llm.details as LlmJudgeDetails;
  const details: JevFirstDetails = {
    ...llmDetails,
    decidedBy: "llm",
    jev: judgment,
    llm: {
      pass: llmDetails.pass,
      issues: llmDetails.issues,
      ...(llmDetails.provider != null && { provider: llmDetails.provider }),
      ...(llmDetails.model != null && { model: llmDetails.model }),
    },
  };

  return {
    ...llm,
    message: `Jev escalated (${judgment.escalationReason}); ${llm.message}`,
    details,
  };
}

/**
 * Build the result when Jev's pass or fail stands.
 *
 * @param assertion - The judge assertion
 * @param answer - Jev's answer
 * @param judgment - The recordable form of the answer
 * @returns Assertion result with no score contribution
 */
function jevDecided(
  assertion: LlmJudgeAssertion,
  answer: JevJudgeResult,
  judgment: JsonJevJudgment,
): EvalAssertionResult {
  const pass = answer.verdict === "pass";
  const issues = pass ? [] : unmetRequirements(answer);
  const details: JevFirstDetails = {
    pass,
    issues,
    decidedBy: "jev",
    jev: judgment,
  };

  return {
    assertion,
    earned: 0,
    maxScore: 0,
    message: pass
      ? "Jev judge: pass"
      : `Jev judge: fail (${issues.length} unmet)`,
    details,
  };
}

/**
 * Name the questions Jev answered "no" to, as the fail's issues.
 *
 * @param answer - Jev's answer
 * @returns One issue per question below the fail threshold
 */
function unmetRequirements(answer: JevJudgeResult): string[] {
  return answer.questions
    .filter((q) => q.probability < FAIL_THRESHOLD)
    .map((q) => {
      const text =
        q.kind === "whole"
          ? "the criteria as a whole"
          : q.text.length > 200
            ? `${q.text.slice(0, 200)}...`
            : q.text;

      return `Jev: not met (P=${q.probability.toFixed(2)}): ${text}`;
    });
}

/**
 * Convert Jev's answer to the form saved in results.
 *
 * @param answer - Jev's answer
 * @param route - The route it came through
 * @returns The saved form
 */
function toJudgment(answer: JevJudgeResult, route: JevRoute): JsonJevJudgment {
  return {
    route,
    verdict: answer.verdict,
    ...(answer.verdict === "escalate" && {
      escalationReason: escalationReason(
        answer.questions,
        answer.minProbability,
      ),
    }),
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
