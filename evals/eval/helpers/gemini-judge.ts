/**
 * Gemini LLM judge for evaluations
 */

import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_CONFIG,
  validateApiKey,
} from "#evals/shared/provider-configs.ts";
import {
  finishJudgeOutput,
  printJudgeChunk,
  printJudgeHeader,
  printJudgeResult,
} from "./judge-output.ts";
import {
  parseJudgeResponse,
  type JudgeResult,
} from "./judge-response-parser.ts";

/**
 * Call Gemini as the LLM judge with streaming output
 *
 * @param prompt - The evaluation prompt
 * @param systemPrompt - System instructions for the judge
 * @param model - Optional model override
 * @param criteria - Evaluation criteria for output
 * @returns Judge result with score and reasoning
 */
export async function callGeminiJudge(
  prompt: string,
  systemPrompt: string,
  model: string | undefined,
  criteria: string,
): Promise<JudgeResult> {
  const apiKey = validateApiKey(GEMINI_CONFIG);
  const ai = new GoogleGenAI({ apiKey });
  const judgeModel = model ?? GEMINI_CONFIG.defaultModel;

  printJudgeHeader("google", judgeModel, criteria);

  const stream = await ai.models.generateContentStream({
    model: judgeModel,
    contents: prompt,
    config: {
      systemInstruction: systemPrompt,
    },
  });

  let text = "";

  for await (const chunk of stream) {
    const chunkText = chunk.text ?? "";

    printJudgeChunk(chunkText);
    text += chunkText;
  }

  finishJudgeOutput();

  const result = parseJudgeResponse(text.trim());

  printJudgeResult(result);

  return result;
}
