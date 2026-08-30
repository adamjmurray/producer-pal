// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Converts internal EvalScenarioResult to JSON-serializable JsonEvalResult
 */

import { isSignalAssertion } from "../../assertions/index.ts";
import {
  type EvalAssertionResult,
  type EvalScenarioResult,
  type EvalTurnResult,
} from "../../types.ts";
import { type SimpleJudgeResult } from "../judge/judge-response-parser.ts";
import { assertionLabel } from "./assertion-label.ts";
import { collectToolErrors } from "./tool-errors.ts";
import {
  type JsonCheckResult,
  type JsonChecks,
  type JsonEfficiency,
  type JsonEvalResult,
  type JsonJudge,
  type JsonTokenUsage,
  type JsonTurnRecord,
} from "./types.ts";

/** Optional trial metadata for repeat runs */
export interface TrialInfo {
  trial: number;
  totalTrials: number;
}

/**
 * Convert an EvalScenarioResult to a JSON-serializable JsonEvalResult
 *
 * @param result - Internal scenario result
 * @param runId - Unique run identifier
 * @param model - Model key (e.g. "google/gemini-3.6-flash")
 * @param configProfileId - Config profile ID
 * @param trialInfo - Optional trial metadata for repeat runs
 * @returns JSON-serializable result
 */
export function toJsonResult(
  result: EvalScenarioResult,
  runId: string,
  model: string,
  configProfileId: string,
  trialInfo?: TrialInfo,
): JsonEvalResult {
  const checks = buildChecks(result.assertions);
  const signals = buildSignals(result.assertions);
  const toolErrors = collectToolErrors(result.turns);
  const efficiency = buildEfficiency(result.assertions);
  const advisory = result.scenario.judgeAdvisory ?? false;
  const judge = buildJudge(result.assertions, advisory);

  return {
    version: 1,
    runId,
    timestamp: new Date().toISOString(),
    scenarioId: result.scenario.id,
    scenarioDescription: result.scenario.description,
    ...(result.scenario.kind && { kind: result.scenario.kind }),
    ...(trialInfo && {
      trial: trialInfo.trial,
      totalTrials: trialInfo.totalTrials,
    }),
    model,
    configProfileId,
    ...(result.instructions && { instructions: result.instructions }),
    result: derivePassFail(checks, judge),
    turns: result.turns.map(convertTurn),
    checks,
    ...(signals.length > 0 && { signals }),
    ...(toolErrors && { toolErrors }),
    ...(efficiency && { efficiency }),
    ...(judge && { judge }),
    totalDurationMs: result.totalDurationMs,
    ...(result.totalUsage && { totalUsage: result.totalUsage }),
    ...(result.error && { error: result.error }),
  };
}

/**
 * Build the gating checks object from the deterministic assertions
 *
 * @param assertions - All assertion results
 * @returns Checks object with pass flag and individual results
 */
function buildChecks(assertions: EvalAssertionResult[]): JsonChecks {
  const results = assertions.filter(isGatingCheck).map(toCheckResult);

  return {
    pass: results.length > 0 && results.every((c) => c.pass),
    results,
  };
}

/**
 * Build the non-gating signal results (prose `response_contains`)
 *
 * @param assertions - All assertion results
 * @returns Signal results, empty when the scenario has none
 */
function buildSignals(assertions: EvalAssertionResult[]): JsonCheckResult[] {
  return assertions
    .filter((a) => isSignalAssertion(a.assertion))
    .map(toCheckResult);
}

/**
 * Whether an assertion result belongs in the gating checks. The judge and
 * token_usage have their own sections; signals report without gating.
 *
 * @param result - An assertion result
 * @returns True when the result gates pass/fail
 */
function isGatingCheck(result: EvalAssertionResult): boolean {
  const { type } = result.assertion;

  return (
    type !== "llm_judge" &&
    type !== "token_usage" &&
    !isSignalAssertion(result.assertion)
  );
}

/**
 * Convert one assertion result to its JSON check record
 *
 * @param a - The assertion result
 * @returns JSON check result
 */
function toCheckResult(a: EvalAssertionResult): JsonCheckResult {
  const details = a.details as Record<string, unknown> | undefined;
  const reflection = details?.reflection as string | undefined;

  return {
    type: a.assertion.type,
    label: assertionLabel(a.assertion),
    pass: a.earned === a.maxScore,
    message: a.message,
    ...(details != null && { details: stripToolResults(details) }),
    ...(reflection != null && { reflection }),
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
 * @param advisory - When true, mark the judge non-gating (see derivePassFail)
 * @returns Judge object, or undefined if no judge assertion
 */
function buildJudge(
  assertions: EvalAssertionResult[],
  advisory: boolean,
): JsonJudge | undefined {
  const judgeResult = assertions.find((a) => a.assertion.type === "llm_judge");

  if (!judgeResult) return undefined;

  const advisoryFlag = advisory ? { advisory: true } : {};
  const details = judgeResult.details as SimpleJudgeResult | undefined;

  if (!details) {
    return { pass: false, issues: [judgeResult.message], ...advisoryFlag };
  }

  return { pass: details.pass, issues: details.issues, ...advisoryFlag };
}

/**
 * Derive overall pass/fail from checks and judge. Every gating signal that is
 * present must pass, and at least one must exist. A non-advisory judge IS a
 * gating signal: a judge-only scenario (no deterministic checks) is decided by
 * the judge alone. An advisory judge never gates — its issues are reported but
 * the checks alone decide. A scenario with neither a check nor a gating judge
 * asserts nothing and cannot be a pass.
 *
 * @param checks - Checks result
 * @param judge - Judge result (if any)
 * @returns "pass" or "fail"
 */
function derivePassFail(
  checks: JsonChecks,
  judge: JsonJudge | undefined,
): "pass" | "fail" {
  const hasChecks = checks.results.length > 0;
  const judgeGates = judge != null && judge.advisory !== true;
  // judge.pass narrows to a definite boolean inside this chain — avoids `=== true`,
  // which a lint autofix strips into a nullable boolean and then breaks typing.
  const judgeFails = judge != null && judge.advisory !== true && !judge.pass;

  // Need at least one gating signal; otherwise the scenario asserts nothing (an
  // empty scenario, or a judge-only one whose judge was skipped) — not a pass.
  if (!hasChecks && !judgeGates) return "fail";

  // Every gating signal that is present must pass: the checks when there are any
  // (checks.pass is false when there are none, so guard on hasChecks), and a
  // non-advisory judge.
  if (hasChecks && !checks.pass) return "fail";
  if (judgeFails) return "fail";

  return "pass";
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
      ...(tc.result != null && { result: tc.result }),
      ...(tc.warnings != null &&
        tc.warnings.length > 0 && { warnings: tc.warnings }),
    })),
    durationMs: turn.durationMs,
    ...(turn.stepUsages && { usage: sumStepUsages(turn.stepUsages) }),
    ...(turn.seeded === true && { seeded: true }),
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
 * Strip tool result strings from check details to avoid duplicating turn data.
 * Removes `result` from `matchingCalls` entries (tool_called assertions).
 *
 * @param details - Assertion details object
 * @returns Details with tool results stripped
 */
function stripToolResults(
  details: Record<string, unknown>,
): Record<string, unknown> {
  const calls = details.matchingCalls;

  if (!Array.isArray(calls)) return details;

  return {
    ...details,
    matchingCalls: calls.map(
      (c: { name: string; args: Record<string, unknown> }) => ({
        name: c.name,
        args: c.args,
      }),
    ),
  };
}
