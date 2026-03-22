// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Converts internal EvalScenarioResult to JSON-serializable JsonEvalResult
 */

import {
  type EvalAssertionResult,
  type EvalScenarioResult,
  type EvalTurnResult,
} from "../../types.ts";
import { type SimpleJudgeResult } from "../judge-response-parser.ts";
import { assertionLabel } from "./assertion-label.ts";
import {
  type JsonCheckResult,
  type JsonEvalResult,
  type JsonReview,
  type JsonTokenUsage,
  type JsonTurnRecord,
} from "./types.ts";

const TOOL_RESULT_MAX_LENGTH = 500;
const TRUNCATION_SUFFIX = "...[truncated]";

/**
 * Convert an EvalScenarioResult to a JSON-serializable JsonEvalResult
 *
 * @param result - Internal scenario result
 * @param runId - Unique run identifier
 * @param model - Model key (e.g. "google/gemini-3-flash-preview")
 * @param configProfileId - Config profile ID
 * @returns JSON-serializable result
 */
export function toJsonResult(
  result: EvalScenarioResult,
  runId: string,
  model: string,
  configProfileId: string,
): JsonEvalResult {
  const checks = convertChecks(result.assertions);
  const review = deriveReview(result.assertions);
  const score = {
    earned: result.earnedScore,
    max: result.maxScore,
    percentage:
      result.maxScore > 0
        ? Math.round((result.earnedScore / result.maxScore) * 100)
        : 100,
  };

  return {
    version: 1,
    runId,
    timestamp: new Date().toISOString(),
    scenarioId: result.scenario.id,
    scenarioDescription: result.scenario.description,
    model,
    configProfileId,
    result: derivePassFail(checks, review),
    score,
    ...(review && { review }),
    turns: result.turns.map(convertTurn),
    checks,
    totalDurationMs: result.totalDurationMs,
    ...(result.totalUsage && { totalUsage: result.totalUsage }),
    ...(result.error && { error: result.error }),
  };
}

/**
 * Derive overall pass/fail from checks and review
 *
 * @param checks - Deterministic check results
 * @param review - Judge review (if any)
 * @returns "pass" or "fail"
 */
function derivePassFail(
  checks: JsonCheckResult[],
  review: JsonReview | undefined,
): "pass" | "fail" {
  const allChecksPassed = checks.every((c) => c.pass);
  const reviewPassed = review == null || review.pass;

  return allChecksPassed && reviewPassed ? "pass" : "fail";
}

/**
 * Convert assertion results to deterministic check results (excludes llm_judge)
 *
 * @param assertions - All assertion results
 * @returns JSON check results for non-judge assertions
 */
function convertChecks(assertions: EvalAssertionResult[]): JsonCheckResult[] {
  return assertions
    .filter((a) => a.assertion.type !== "llm_judge")
    .map((a) => {
      const details = a.details as Record<string, unknown> | undefined;
      const reflection = details?.reflection as string | undefined;

      return {
        type: a.assertion.type,
        label: assertionLabel(a.assertion),
        pass: a.earned === a.maxScore,
        earned: a.earned,
        maxScore: a.maxScore,
        message: a.message,
        ...(details != null && { details }),
        ...(reflection != null && { reflection }),
      };
    });
}

/**
 * Derive review from LLM judge assertion results
 *
 * @param assertions - All assertion results
 * @returns Review object, or undefined if no judge assertions
 */
function deriveReview(
  assertions: EvalAssertionResult[],
): JsonReview | undefined {
  const judgeResult = assertions.find((a) => a.assertion.type === "llm_judge");

  if (!judgeResult) return undefined;

  const details = judgeResult.details as SimpleJudgeResult | undefined;

  if (!details) {
    return { pass: false, issues: [judgeResult.message] };
  }

  return { pass: details.pass, issues: details.issues };
}

/**
 * Convert a turn to JSON-serializable format with truncated tool results
 *
 * @param turn - Internal turn result
 * @returns JSON turn record
 */
function convertTurn(turn: EvalTurnResult): JsonTurnRecord {
  return {
    turnIndex: turn.turnIndex,
    userMessage: turn.userMessage,
    assistantResponse: turn.assistantResponse,
    toolCalls: turn.toolCalls.map((tc) => ({
      name: tc.name,
      args: tc.args,
      ...(tc.result != null && { result: truncateToolResult(tc.result) }),
    })),
    durationMs: turn.durationMs,
    ...(turn.stepUsages && { usage: sumStepUsages(turn.stepUsages) }),
  };
}

/**
 * Sum token usage across all steps in a turn
 *
 * @param steps - Per-step token usage
 * @returns Aggregated token usage
 */
function sumStepUsages(steps: JsonTokenUsage[]): JsonTokenUsage {
  let input = 0;
  let output = 0;
  let reasoning = 0;

  for (const step of steps) {
    input += step.inputTokens ?? 0;
    output += step.outputTokens ?? 0;
    reasoning += step.reasoningTokens ?? 0;
  }

  return {
    inputTokens: input,
    outputTokens: output,
    ...(reasoning > 0 && { reasoningTokens: reasoning }),
  };
}

/**
 * Truncate a tool result string to keep JSON file sizes manageable
 *
 * @param text - Tool result text
 * @returns Truncated text
 */
export function truncateToolResult(text: string): string {
  if (text.length <= TOOL_RESULT_MAX_LENGTH) return text;

  return (
    text.slice(0, TOOL_RESULT_MAX_LENGTH - TRUNCATION_SUFFIX.length) +
    TRUNCATION_SUFFIX
  );
}
