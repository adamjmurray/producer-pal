// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * LLM-as-judge assertion — single-pass pass/fail evaluation
 */

import {
  parseSimpleJudgeResponse,
  type SimpleJudgeResult,
} from "../helpers/judge/judge-response-parser.ts";
import { callJudge, resolveJudgeModel } from "../helpers/judge/judge.ts";
import {
  type LlmJudgeAssertion,
  type EvalTurnResult,
  type EvalAssertionResult,
  type EvalProvider,
} from "../types.ts";
import { errorMessage } from "#src/shared/error-message.ts";

export const JUDGE_SYSTEM_PROMPT = `You are reviewing an AI assistant's performance in a music production task.

Review the conversation transcript, deterministic check results, and scenario expectations below. Then decide whether the assistant's performance is acceptable.

Your job is NOT to re-evaluate what the deterministic checks already cover. Instead:
- For any FAILED checks: note them but don't repeat what's already captured
- Flag anything ELSE wrong that the checks didn't catch: hallucinations, misleading statements, unnecessary steps, missing information, confusing responses
- Be specific and concise

You MUST respond with ONLY a JSON object in this exact format:
{"pass": true, "issues": ["issue 1", "issue 2"]}

If everything looks good and all checks passed, respond with:
{"pass": true, "issues": []}

Do not include any other text before or after the JSON.`;

/** Starts the message of a result whose judge call failed (no real verdict). */
export const LLM_JUDGE_ERROR_PREFIX = "LLM judge error: ";

interface JudgeOverride {
  provider?: EvalProvider;
  model?: string;
}

/** Judge verdict plus the judge that gave it (unset when no judge was called) */
export interface LlmJudgeDetails extends SimpleJudgeResult {
  provider?: EvalProvider;
  model?: string;
}

/** The parts of a turn the transcript shows; live and saved turns both fit. */
export interface TranscriptTurn {
  userMessage: string;
  assistantResponse: string;
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: string;
    warnings?: string[];
  }>;
}

/** Lightweight check summary passed to the judge prompt */
export interface CheckSummary {
  pass: boolean;
  label: string;
  message: string;
}

/**
 * Call an LLM to judge the response quality (pass/fail)
 *
 * @param assertion - The LLM judge assertion
 * @param turns - All conversation turns
 * @param defaultProvider - Default provider from scenario
 * @param cliOverride - Optional CLI override for judge provider/model
 * @param checkSummaries - Deterministic check results for the judge to see
 * @returns Assertion result with pass/fail
 */
export async function assertWithLlmJudge(
  assertion: LlmJudgeAssertion,
  turns: EvalTurnResult[],
  defaultProvider: EvalProvider,
  cliOverride?: JudgeOverride,
  checkSummaries?: CheckSummary[],
): Promise<EvalAssertionResult> {
  // CLI override > assertion-level > scenario default
  const provider =
    cliOverride?.provider ?? assertion.judgeProvider ?? defaultProvider;
  const model = cliOverride?.model ?? assertion.judgeModel;

  if (turns.length === 0) {
    return noScoreResult(
      assertion,
      "No turns available for LLM judge evaluation",
      { pass: false, issues: ["No turns found"] },
    );
  }

  const judgePrompt = buildJudgePrompt(assertion, turns, checkSummaries ?? []);

  let judgeModel = model;

  try {
    assertJudgeProviderAllowed(provider);
    judgeModel = resolveJudgeModel(provider, model);

    const result = await callJudge(
      judgePrompt,
      JUDGE_SYSTEM_PROMPT,
      provider,
      judgeModel,
      assertion.prompt,
    );
    const verdict = parseSimpleJudgeResponse(result);

    return noScoreResult(
      assertion,
      verdict.pass
        ? "LLM judge: pass"
        : `LLM judge: fail (${verdict.issues.length} issue(s))`,
      { ...verdict, provider, model: judgeModel },
    );
  } catch (error) {
    const msg = errorMessage(error);

    return noScoreResult(assertion, `${LLM_JUDGE_ERROR_PREFIX}${msg}`, {
      pass: false,
      issues: [msg],
      provider,
      model: judgeModel,
    });
  }
}

/**
 * Build the prompt for the judge LLM
 *
 * @param assertion - The LLM judge assertion config
 * @param turns - All conversation turns
 * @param checkSummaries - Deterministic check results
 * @returns Formatted prompt string
 */
function buildJudgePrompt(
  assertion: LlmJudgeAssertion,
  turns: EvalTurnResult[],
  checkSummaries: CheckSummary[],
): string {
  const transcript = formatTranscript(turns);
  const checks = formatCheckResults(checkSummaries);

  return `## Conversation transcript

${transcript}

## Deterministic check results

${checks || "(no deterministic checks)"}

## Scenario expectations

${assertion.prompt}`;
}

/**
 * Format conversation turns as a transcript
 *
 * @param turns - All conversation turns
 * @returns Formatted transcript string
 */
export function formatTranscript(turns: TranscriptTurn[]): string {
  return turns
    .map((turn, i) => {
      const toolCallsSummary =
        turn.toolCalls.length > 0
          ? turn.toolCalls
              .map((tc) => {
                const call = `  - ${tc.name}(${JSON.stringify(tc.args)})`;
                const result = tc.result ? `    → ${tc.result}` : "";
                // Warnings are the tool's warn-and-skip signal; without them the
                // judge reads a refused operation as a successful one.
                const warnings = (tc.warnings ?? []).map((w) => `    ${w}`);

                return [call, result, ...warnings].filter(Boolean).join("\n");
              })
              .join("\n")
          : "  (no tool calls)";

      return `[Turn ${i + 1}]
User: ${turn.userMessage}
Assistant: ${turn.assistantResponse}
Tool calls:
${toolCallsSummary}`;
    })
    .join("\n\n");
}

/**
 * Format deterministic check results for the judge prompt
 *
 * @param summaries - Check summaries
 * @returns Formatted check results string
 */
export function formatCheckResults(summaries: CheckSummary[]): string {
  return summaries
    .map((s) => {
      const icon = s.pass ? "✓" : "✗";
      const detail = s.pass ? "" : ` — ${s.message}`;

      return `  ${icon} ${s.label}${detail}`;
    })
    .join("\n");
}

/**
 * Build an EvalAssertionResult with no score contribution.
 * The judge is pass/fail only — it doesn't contribute to the numeric score total.
 *
 * @param assertion - The judge assertion
 * @param message - Human-readable status
 * @param details - Judge verdict and the judge that gave it
 * @returns Assertion result with earned=0, maxScore=0
 */
function noScoreResult(
  assertion: LlmJudgeAssertion,
  message: string,
  details: LlmJudgeDetails,
): EvalAssertionResult {
  return { assertion, earned: 0, maxScore: 0, message, details };
}

/**
 * Refuse providers that can't judge.
 *
 * @param provider - LLM provider chosen for the judge
 */
function assertJudgeProviderAllowed(provider: EvalProvider): void {
  if (provider === "local") {
    throw new Error(
      "Local provider cannot be used as LLM judge. Set judgeProvider to a cloud provider.",
    );
  }
}
