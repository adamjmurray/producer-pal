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
  type JsonChecks,
  type JsonEfficiency,
  type JsonEvalResult,
  type JsonJudge,
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
  const checks = buildChecks(result.assertions);
  const efficiency = buildEfficiency(result.assertions);
  const judge = buildJudge(result.assertions);

  return {
    version: 1,
    runId,
    timestamp: new Date().toISOString(),
    scenarioId: result.scenario.id,
    scenarioDescription: result.scenario.description,
    model,
    configProfileId,
    result: derivePassFail(checks, judge),
    checks,
    ...(efficiency && { efficiency }),
    ...(judge && { judge }),
    turns: result.turns.map(convertTurn),
    totalDurationMs: result.totalDurationMs,
    ...(result.totalUsage && { totalUsage: result.totalUsage }),
    ...(result.error && { error: result.error }),
  };
}

/**
 * Build checks object from non-judge, non-token_usage assertions
 *
 * @param assertions - All assertion results
 * @returns Checks object with pass flag and individual results
 */
function buildChecks(assertions: EvalAssertionResult[]): JsonChecks {
  const results = assertions
    .filter(
      (a) =>
        a.assertion.type !== "llm_judge" && a.assertion.type !== "token_usage",
    )
    .map((a) => {
      const details = a.details as Record<string, unknown> | undefined;
      const reflection = details?.reflection as string | undefined;

      return {
        type: a.assertion.type,
        label: assertionLabel(a.assertion),
        pass: a.earned === a.maxScore,
        message: a.message,
        ...(details != null && { details }),
        ...(reflection != null && { reflection }),
      };
    });

  return {
    pass: results.every((c) => c.pass),
    results,
  };
}

/**
 * Build efficiency object from token_usage assertion
 *
 * @param assertions - All assertion results
 * @returns Efficiency object, or undefined if no token_usage assertion
 */
function buildEfficiency(
  assertions: EvalAssertionResult[],
): JsonEfficiency | undefined {
  const tokenResult = assertions.find(
    (a) => a.assertion.type === "token_usage",
  );

  if (!tokenResult) return undefined;

  const details = tokenResult.details as
    | { total: number; target: number; percentage: number }
    | undefined;

  return {
    inputTokens: details?.total ?? 0,
    targetTokens: details?.target ?? 0,
    percentage: details?.percentage ?? 0,
  };
}

/**
 * Build judge object from llm_judge assertion
 *
 * @param assertions - All assertion results
 * @returns Judge object, or undefined if no judge assertion
 */
function buildJudge(assertions: EvalAssertionResult[]): JsonJudge | undefined {
  const judgeResult = assertions.find((a) => a.assertion.type === "llm_judge");

  if (!judgeResult) return undefined;

  const details = judgeResult.details as SimpleJudgeResult | undefined;

  if (!details) {
    return { pass: false, issues: [judgeResult.message] };
  }

  return { pass: details.pass, issues: details.issues };
}

/**
 * Derive overall pass/fail from checks and judge
 *
 * @param checks - Checks result
 * @param judge - Judge result (if any)
 * @returns "pass" or "fail"
 */
function derivePassFail(
  checks: JsonChecks,
  judge: JsonJudge | undefined,
): "pass" | "fail" {
  const judgePassed = judge == null || judge.pass;

  return checks.pass && judgePassed ? "pass" : "fail";
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
