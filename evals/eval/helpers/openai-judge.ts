/**
 * OpenAI-compatible LLM judge for evaluations
 * Supports both OpenAI and OpenRouter providers
 */

import OpenAI from "openai";
import { DEFAULT_MODEL as DEFAULT_OPENAI_MODEL } from "#evals/chat/openai/config.ts";
import { DEFAULT_MODEL as DEFAULT_OPENROUTER_MODEL } from "#evals/chat/openrouter/config.ts";
import {
  printJudgeHeader,
  printJudgeChunk,
  finishJudgeOutput,
} from "#evals/shared/judge-streaming.ts";
import {
  parseJudgeResponse,
  type JudgeResult,
} from "./judge-response-parser.ts";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

interface JudgeConfig {
  apiKeyEnvVar: string;
  defaultModel: string;
  createClient: (apiKey: string) => OpenAI;
}

const OPENAI_JUDGE_CONFIG: JudgeConfig = {
  apiKeyEnvVar: "OPENAI_KEY",
  defaultModel: DEFAULT_OPENAI_MODEL,
  createClient: (apiKey: string) => new OpenAI({ apiKey }),
};

const OPENROUTER_JUDGE_CONFIG: JudgeConfig = {
  apiKeyEnvVar: "OPENROUTER_KEY",
  defaultModel: DEFAULT_OPENROUTER_MODEL,
  createClient: (apiKey: string) =>
    new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL }),
};

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
  const config =
    provider === "openai" ? OPENAI_JUDGE_CONFIG : OPENROUTER_JUDGE_CONFIG;
  const apiKey = process.env[config.apiKeyEnvVar];

  if (!apiKey) {
    throw new Error(`API key for ${provider} is not set`);
  }

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

  return parseJudgeResponse(text.trim());
}
