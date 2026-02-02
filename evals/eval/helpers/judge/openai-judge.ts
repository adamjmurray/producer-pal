/**
 * OpenAI-compatible LLM judge for evaluations
 * Supports both OpenAI and OpenRouter providers
 */

import {
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
  validateApiKey,
  type OpenAIProviderConfig,
} from "#evals/shared/provider-configs.ts";
import {
  parseJudgeResponse,
  type JudgeResult,
} from "../judge-response-parser.ts";
import {
  finishJudgeOutput,
  printJudgeChunk,
  printJudgeHeader,
  printJudgeResult,
} from "./judge-output.ts";

/**
 * Call OpenAI or OpenRouter as the LLM judge with streaming output
 *
 * @param prompt - The evaluation prompt
 * @param systemPrompt - System instructions for the judge
 * @param provider - Either "openai" or "openrouter"
 * @param model - Optional model override
 * @param criteria - Evaluation criteria for output
 * @returns Judge result with score and reasoning
 */
export async function callOpenAIJudge(
  prompt: string,
  systemPrompt: string,
  provider: "openai" | "openrouter",
  model: string | undefined,
  criteria: string,
): Promise<JudgeResult> {
  const config: OpenAIProviderConfig =
    provider === "openai" ? OPENAI_CONFIG : OPENROUTER_CONFIG;
  const apiKey = validateApiKey(config);
  const client = config.createClient(apiKey);
  const judgeModel = model ?? config.defaultModel;

  printJudgeHeader(provider, judgeModel, criteria);

  const stream = await client.chat.completions.create({
    model: judgeModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    stream: true,
  });

  let text = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    const chunkText = delta?.content ?? "";

    printJudgeChunk(chunkText);
    text += chunkText;
  }

  finishJudgeOutput();

  const result = parseJudgeResponse(text.trim());

  printJudgeResult(result);

  return result;
}
