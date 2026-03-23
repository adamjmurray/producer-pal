// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * LLM-as-judge assertion — single-pass pass/fail evaluation
 */

import { callJudge } from "../helpers/judge/judge.ts";
import {
  parseSimpleJudgeResponse,
  type SimpleJudgeResult,
} from "../helpers/judge-response-parser.ts";
import {
  type LlmJudgeAssertion,
  type EvalTurnResult,
  type EvalAssertionResult,
  type EvalProvider,
} from "../types.ts";

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

interface JudgeOverride {
  provider: EvalProvider;
  model?: string;
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
  if (turns.length === 0) {
    return noScoreResult(
      assertion,
      "No turns available for LLM judge evaluation",
      {
        pass: false,
        issues: ["No turns found"],
      },
    );
  }

  const judgePrompt = buildJudgePrompt(assertion, turns, checkSummaries ?? []);

  // CLI override > assertion-level > scenario default
  const provider =
    cliOverride?.provider ?? assertion.judgeProvider ?? defaultProvider;
  const model = cliOverride?.model ?? assertion.judgeModel;

  try {
    const result = await callSimpleJudge(
      judgePrompt,
      provider,
      model,
      assertion.prompt,
    );

    return noScoreResult(
      assertion,
      result.pass
        ? "LLM judge: pass"
        : `LLM judge: fail (${result.issues.length} issue(s))`,
      result,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    return noScoreResult(assertion, `LLM judge error: ${msg}`, {
      pass: false,
      issues: [msg],
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
function formatTranscript(turns: EvalTurnResult[]): string {
  return turns
    .map((turn, i) => {
      const toolCallsSummary =
        turn.toolCalls.length > 0
          ? turn.toolCalls
              .map((tc) => {
                const call = `  - ${tc.name}(${JSON.stringify(tc.args)})`;
                const result = tc.result ? `    → ${tc.result}` : "";

                return result ? `${call}\n${result}` : call;
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
function formatCheckResults(summaries: CheckSummary[]): string {
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
 * @param details - SimpleJudgeResult with pass/issues
 * @returns Assertion result with earned=0, maxScore=0
 */
function noScoreResult(
  assertion: LlmJudgeAssertion,
  message: string,
  details: SimpleJudgeResult,
): EvalAssertionResult {
  return { assertion, earned: 0, maxScore: 0, message, details };
}

/**
 * Call the judge LLM with the simplified prompt
 *
 * @param prompt - The evaluation prompt
 * @param provider - LLM provider to use
 * @param model - Optional model override
 * @param criteria - Evaluation criteria for output display
 * @returns Simple judge result with pass/fail and issues
 */
async function callSimpleJudge(
  prompt: string,
  provider: EvalProvider,
  model: string | undefined,
  criteria: string,
): Promise<SimpleJudgeResult> {
  if (provider === "local") {
    throw new Error(
      "Local provider cannot be used as LLM judge. Set judgeProvider to a cloud provider.",
    );
  }

  const text = await callJudge(
    prompt,
    JUDGE_SYSTEM_PROMPT,
    provider,
    model,
    criteria,
  );

  return parseSimpleJudgeResponse(text);
}
