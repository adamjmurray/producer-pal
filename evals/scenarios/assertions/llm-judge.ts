/**
 * LLM-as-judge assertion - use an LLM to evaluate response quality
 */

import { GoogleGenAI } from "@google/genai";
import {
  parseJudgeResponse,
  type JudgeResult,
} from "../helpers/judge-response-parser.ts";
import { callOpenAIJudge } from "../helpers/openai-judge.ts";
import type {
  LlmJudgeAssertion,
  EvalTurnResult,
  EvalAssertionResult,
  EvalProvider,
} from "../types.ts";

export const JUDGE_SYSTEM_PROMPT = `You are evaluating an AI assistant's response for a music production task.

Rate the response on a scale of 1-5:
1 = Completely wrong or failed to accomplish the task
2 = Major issues, only partially accomplished the task
3 = Acceptable with some issues
4 = Good, accomplished the task well
5 = Excellent, exceeded expectations

You MUST respond with ONLY a JSON object in this exact format:
{"score": <number>, "reasoning": "<brief explanation>"}

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
  const targetTurn =
    assertion.turn === "last" || assertion.turn == null
      ? turns.at(-1)
      : turns[assertion.turn];

  if (!targetTurn) {
    return {
      assertion,
      passed: false,
      message: "No turn available for LLM judge evaluation",
      details: { error: "No turn found" },
    };
  }

  const judgePrompt = buildJudgePrompt(assertion, targetTurn);

  // CLI override > assertion-level > scenario default
  const provider =
    cliOverride?.provider ?? assertion.judgeProvider ?? defaultProvider;
  const model = cliOverride?.model ?? assertion.judgeModel;

  try {
    const judgeResult = await callJudgeLlm(judgePrompt, provider, model);
    const minScore = assertion.minScore ?? 3;
    const passed = judgeResult.score >= minScore;

    return {
      assertion,
      passed,
      message: passed
        ? `LLM judge score: ${judgeResult.score}/5 (min: ${minScore})`
        : `LLM judge score ${judgeResult.score}/5 below minimum ${minScore}`,
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

/**
 * Build the prompt for the judge LLM
 *
 * @param assertion - The LLM judge assertion config
 * @param turn - The turn to evaluate
 * @returns Formatted prompt string
 */
function buildJudgePrompt(
  assertion: LlmJudgeAssertion,
  turn: EvalTurnResult,
): string {
  const toolCallsSummary =
    turn.toolCalls.length > 0
      ? turn.toolCalls
          .map((tc) => `- ${tc.name}(${JSON.stringify(tc.args)})`)
          .join("\n")
      : "(no tool calls)";

  return `User request: ${turn.userMessage}

Assistant response: ${turn.assistantResponse}

Tool calls made:
${toolCallsSummary}

Evaluation criteria: ${assertion.prompt}`;
}

/**
 * Call the judge LLM
 *
 * @param prompt - The evaluation prompt
 * @param provider - LLM provider to use
 * @param model - Optional model override
 * @returns Judge result with score and reasoning
 */
async function callJudgeLlm(
  prompt: string,
  provider: EvalProvider,
  model?: string,
): Promise<JudgeResult> {
  switch (provider) {
    case "gemini":
      return await callGeminiJudge(prompt, model);
    case "openai":
    case "openrouter":
      return await callOpenAIJudge(
        prompt,
        JUDGE_SYSTEM_PROMPT,
        provider,
        model,
      );

    default: {
      const _exhaustiveCheck: never = provider;

      throw new Error(
        `Unknown provider for LLM judge: ${String(_exhaustiveCheck)}`,
      );
    }
  }
}

/**
 * Call Gemini as the judge
 *
 * @param prompt - The evaluation prompt
 * @param model - Optional model override
 * @returns Judge result with score and reasoning
 */
async function callGeminiJudge(
  prompt: string,
  model?: string,
): Promise<JudgeResult> {
  const apiKey = process.env.GEMINI_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_KEY environment variable is required for LLM judge",
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const judgeModel = model ?? "gemini-2.0-flash";

  const response = await ai.models.generateContent({
    model: judgeModel,
    contents: prompt,
    config: {
      systemInstruction: JUDGE_SYSTEM_PROMPT,
    },
  });

  const text = response.text?.trim() ?? "";

  return parseJudgeResponse(text);
}
