// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * LLM-as-judge assertion - use an LLM to evaluate response quality
 */

import { callAnthropicJudge } from "../helpers/judge/anthropic-judge.ts";
import { callGeminiJudge } from "../helpers/judge/gemini-judge.ts";
import { callOpenAIJudge } from "../helpers/judge/openai-judge.ts";
import type { JudgeResult } from "../helpers/judge-response-parser.ts";
import type {
  LlmJudgeAssertion,
  EvalTurnResult,
  EvalAssertionResult,
  EvalProvider,
  DimensionMinScores,
} from "../types.ts";

export const JUDGE_SYSTEM_PROMPT = `You are evaluating an AI assistant's response for a music production task.

Rate the response on 4 dimensions using a 1-5 scale:

**Accuracy** (Did it do exactly what was requested in Ableton?)
1 = Completely wrong or failed to accomplish the task
2 = Major issues, only partially accomplished the task
3 = Acceptable with some issues
4 = Good, accomplished the task well
5 = Excellent, exceeded expectations

**Reasoning** (Was its logic sound and did it pick the right tools?)
1 = Nonsensical logic, wrong tools used
2 = Flawed reasoning, poor tool choices
3 = Acceptable reasoning with some gaps
4 = Sound logic, appropriate tool usage
5 = Excellent reasoning, optimal tool selection

**Efficiency** (Did it use minimal steps?)
1 = Extremely inefficient, many unnecessary steps
2 = Inefficient, several redundant operations
3 = Acceptable, minor inefficiencies
4 = Efficient workflow
5 = Optimal, no wasted steps

**Naturalness** (Did the interaction feel human-like?)
1 = Robotic, inappropriate responses
2 = Stilted, misses social cues
3 = Acceptable, some awkwardness
4 = Natural, adapts well to context
5 = Seamless, asks clarifications when needed, adapts to complexity

You MUST respond with ONLY a JSON object in this exact format:
{
  "accuracy": {"score": <1-5>, "reasoning": "<brief explanation>"},
  "reasoning": {"score": <1-5>, "reasoning": "<brief explanation>"},
  "efficiency": {"score": <1-5>, "reasoning": "<brief explanation>"},
  "naturalness": {"score": <1-5>, "reasoning": "<brief explanation>"}
}

Do not include any other text before or after the JSON.`;

interface JudgeOverride {
  provider: EvalProvider;
  model?: string;
}

/**
 * Call an LLM to judge the response quality
 *
 * @param assertion - The LLM judge assertion
 * @param turns - All conversation turns
 * @param defaultProvider - Default provider from scenario
 * @param cliOverride - Optional CLI override for judge provider/model
 * @returns Assertion result with pass/fail and details
 */
export async function assertWithLlmJudge(
  assertion: LlmJudgeAssertion,
  turns: EvalTurnResult[],
  defaultProvider: EvalProvider,
  cliOverride?: JudgeOverride,
): Promise<EvalAssertionResult> {
  if (turns.length === 0) {
    return {
      assertion,
      passed: false,
      message: "No turns available for LLM judge evaluation",
      details: { error: "No turns found" },
    };
  }

  // Determine which turn to highlight (null means evaluate full conversation)
  const targetTurnIndex =
    assertion.turn === "last" || assertion.turn == null ? null : assertion.turn;

  const judgePrompt = buildJudgePrompt(assertion, turns, targetTurnIndex);

  // CLI override > assertion-level > scenario default
  const provider =
    cliOverride?.provider ?? assertion.judgeProvider ?? defaultProvider;
  const model = cliOverride?.model ?? assertion.judgeModel;

  try {
    const judgeResult = await callJudgeLlm(
      judgePrompt,
      provider,
      model,
      assertion.prompt,
    );
    const minScore = assertion.minScore ?? 3;
    const { passed, failedDimensions } = checkPassFail(
      judgeResult,
      minScore,
      assertion.minScores,
    );

    let message = passed ? "LLM judge passed" : "LLM judge failed";

    if (failedDimensions.length > 0) {
      message += `: ${failedDimensions.join(", ")}`;
    }

    return {
      assertion,
      passed,
      message,
      details: judgeResult,
    };
  } catch (error) {
    return {
      assertion,
      passed: false,
      message: `LLM judge error: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
    };
  }
}

const DIMENSION_KEYS = [
  "accuracy",
  "reasoning",
  "efficiency",
  "naturalness",
] as const;

/**
 * Check if the judge result passes all thresholds
 *
 * @param result - The judge result with dimension scores
 * @param minOverall - Minimum overall score required
 * @param minScores - Optional per-dimension minimums
 * @returns Pass status and list of failed dimensions
 */
function checkPassFail(
  result: JudgeResult,
  minOverall: number,
  minScores?: DimensionMinScores,
): { passed: boolean; failedDimensions: string[] } {
  const failedDimensions: string[] = [];

  // Check overall score
  if (result.overall < minOverall) {
    failedDimensions.push(
      `overall (${result.overall.toFixed(2)} < ${minOverall})`,
    );
  }

  // Check per-dimension minimums if specified
  if (minScores) {
    for (const key of DIMENSION_KEYS) {
      const minForDim = minScores[key];

      if (minForDim != null && result[key].score < minForDim) {
        failedDimensions.push(`${key} (${result[key].score} < ${minForDim})`);
      }
    }
  }

  return {
    passed: failedDimensions.length === 0,
    failedDimensions,
  };
}

/**
 * Build the prompt for the judge LLM
 *
 * Includes full conversation history so the judge can evaluate multi-turn workflows.
 *
 * @param assertion - The LLM judge assertion config
 * @param turns - All conversation turns
 * @param targetTurnIndex - Specific turn to evaluate, or null for full conversation
 * @returns Formatted prompt string
 */
function buildJudgePrompt(
  assertion: LlmJudgeAssertion,
  turns: EvalTurnResult[],
  targetTurnIndex: number | null,
): string {
  // Build full conversation transcript
  const conversationTranscript = turns
    .map((turn, i) => {
      const toolCallsSummary =
        turn.toolCalls.length > 0
          ? turn.toolCalls
              .map((tc) => `  - ${tc.name}(${JSON.stringify(tc.args)})`)
              .join("\n")
          : "  (no tool calls)";

      return `[Turn ${i + 1}]
User: ${turn.userMessage}
Assistant: ${turn.assistantResponse}
Tool calls:
${toolCallsSummary}`;
    })
    .join("\n\n");

  // If evaluating a specific turn, note it
  const turnNote =
    targetTurnIndex != null
      ? `\n\nNote: Evaluating Turn ${targetTurnIndex + 1} specifically.`
      : "";

  return `Full conversation:

${conversationTranscript}
${turnNote}

Evaluation criteria: ${assertion.prompt}`;
}

/**
 * Call the judge LLM
 *
 * @param prompt - The evaluation prompt
 * @param provider - LLM provider to use
 * @param model - Optional model override
 * @param criteria - Evaluation criteria for output
 * @returns Judge result with score and reasoning
 */
async function callJudgeLlm(
  prompt: string,
  provider: EvalProvider,
  model: string | undefined,
  criteria: string,
): Promise<JudgeResult> {
  switch (provider) {
    case "anthropic":
      return await callAnthropicJudge(
        prompt,
        JUDGE_SYSTEM_PROMPT,
        model,
        criteria,
      );
    case "google":
      return await callGeminiJudge(
        prompt,
        JUDGE_SYSTEM_PROMPT,
        model,
        criteria,
      );
    case "openai":
    case "openrouter":
      return await callOpenAIJudge(
        prompt,
        JUDGE_SYSTEM_PROMPT,
        provider,
        model,
        criteria,
      );

    default: {
      const _exhaustiveCheck: never = provider;

      throw new Error(
        `Unknown provider for LLM judge: ${String(_exhaustiveCheck)}`,
      );
    }
  }
}
