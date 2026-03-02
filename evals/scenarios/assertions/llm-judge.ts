// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * LLM-as-judge assertion - use an LLM to evaluate response quality
 */

import { callAiSdkJudge } from "../helpers/judge/ai-sdk-judge.ts";
import { type JudgeResult } from "../helpers/judge-response-parser.ts";
import {
  type LlmJudgeAssertion,
  type EvalTurnResult,
  type EvalAssertionResult,
  type EvalProvider,
} from "../types.ts";

export const JUDGE_SYSTEM_PROMPT = `You are evaluating an AI assistant's response for a music production task.

Rate the response on 4 dimensions using a 0.0 to 1.0 scale:

**Accuracy** (Did it do exactly what was requested in Ableton?)
0.0 = Completely wrong or failed to accomplish the task
0.5 = Acceptable with some issues
1.0 = Excellent, accomplished exactly what was requested

**Reasoning** (Was its logic sound and did it pick the right tools?)
0.0 = Nonsensical logic, wrong tools used
0.5 = Acceptable reasoning with some gaps
1.0 = Excellent reasoning, optimal tool selection

**Efficiency** (Did it use minimal steps?)
0.0 = Extremely inefficient, many unnecessary steps
0.5 = Acceptable, minor inefficiencies
1.0 = Optimal, no wasted steps

**Naturalness** (Did the interaction feel human-like?)
0.0 = Robotic, inappropriate responses
0.5 = Acceptable, some awkwardness
1.0 = Seamless, asks clarifications when needed, adapts to complexity

You MUST respond with ONLY a JSON object in this exact format:
{
  "accuracy": {"score": <0.0-1.0>, "reasoning": "<brief explanation>"},
  "reasoning": {"score": <0.0-1.0>, "reasoning": "<brief explanation>"},
  "efficiency": {"score": <0.0-1.0>, "reasoning": "<brief explanation>"},
  "naturalness": {"score": <0.0-1.0>, "reasoning": "<brief explanation>"}
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
 * @returns Assertion result with earned/maxScore
 */
export async function assertWithLlmJudge(
  assertion: LlmJudgeAssertion,
  turns: EvalTurnResult[],
  defaultProvider: EvalProvider,
  cliOverride?: JudgeOverride,
): Promise<EvalAssertionResult> {
  const maxScore = assertion.score ?? 1;

  if (turns.length === 0) {
    return {
      assertion,
      earned: 0,
      maxScore,
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
    const earned = judgeResult.overall * maxScore;

    return {
      assertion,
      earned,
      maxScore,
      message: `LLM judge: ${earned.toFixed(1)}/${maxScore}`,
      details: judgeResult,
    };
  } catch (error) {
    return {
      assertion,
      earned: 0,
      maxScore,
      message: `LLM judge error: ${error instanceof Error ? error.message : String(error)}`,
      details: { error: String(error) },
    };
  }
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
  if (provider === "local") {
    throw new Error(
      "Local provider cannot be used as LLM judge. Set judgeProvider to a cloud provider.",
    );
  }

  return await callAiSdkJudge(
    prompt,
    JUDGE_SYSTEM_PROMPT,
    provider,
    model,
    criteria,
  );
}
