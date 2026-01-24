/**
 * LLM-as-judge assertion - use an LLM to evaluate response quality
 */

import { GoogleGenAI } from "@google/genai";
import type {
  LlmJudgeAssertion,
  EvalTurnResult,
  EvalAssertionResult,
  EvalProvider,
} from "../types.ts";

const JUDGE_SYSTEM_PROMPT = `You are evaluating an AI assistant's response for a music production task.

Rate the response on a scale of 1-5:
1 = Completely wrong or failed to accomplish the task
2 = Major issues, only partially accomplished the task
3 = Acceptable with some issues
4 = Good, accomplished the task well
5 = Excellent, exceeded expectations

You MUST respond with ONLY a JSON object in this exact format:
{"score": <number>, "reasoning": "<brief explanation>"}

Do not include any other text before or after the JSON.`;

interface JudgeResult {
  score: number;
  reasoning: string;
}

/**
 * Call an LLM to judge the response quality
 *
 * @param assertion - The LLM judge assertion
 * @param turns - All conversation turns
 * @param defaultProvider - Default provider from scenario
 * @returns Assertion result with pass/fail and details
 */
export async function assertWithLlmJudge(
  assertion: LlmJudgeAssertion,
  turns: EvalTurnResult[],
  defaultProvider: EvalProvider,
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
  const provider = assertion.judgeProvider ?? defaultProvider;

  try {
    const judgeResult = await callJudgeLlm(
      judgePrompt,
      provider,
      assertion.judgeModel,
    );
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
  if (provider !== "gemini") {
    throw new Error(
      `Provider "${provider}" not yet implemented for LLM judge. Only "gemini" is supported.`,
    );
  }

  return await callGeminiJudge(prompt, model);
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
      temperature: 0,
    },
  });

  const text = response.text?.trim() ?? "";

  // Parse JSON response
  try {
    const result = JSON.parse(text) as JudgeResult;

    if (
      typeof result.score !== "number" ||
      typeof result.reasoning !== "string"
    ) {
      throw new Error("Invalid judge response format");
    }

    return result;
  } catch {
    // Try to extract JSON from response if it has extra text.
    // This regex is intentionally simple - it only matches flat objects without
    // nested braces. The expected format is {"score": N, "reasoning": "..."}
    // which should never have nested braces. This is a best-effort fallback.
    const jsonMatch = /{[^}]+}/.exec(text);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]) as JudgeResult;

      if (
        typeof result.score === "number" &&
        typeof result.reasoning === "string"
      ) {
        return result;
      }
    }

    throw new Error(`Failed to parse judge response: ${text}`);
  }
}
