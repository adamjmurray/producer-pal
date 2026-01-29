/**
 * Anthropic LLM judge for evaluations
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages/messages";
import { DEFAULT_MODEL } from "#evals/chat/anthropic/config.ts";
import {
  printJudgeHeader,
  printJudgeChunk,
  finishJudgeOutput,
} from "#evals/shared/judge-streaming.ts";
import {
  parseJudgeResponse,
  type JudgeResult,
} from "./judge-response-parser.ts";

const DEFAULT_MAX_TOKENS = 1024;

/**
 * Call Anthropic as the LLM judge with streaming output
 *
 * @param prompt - The evaluation prompt
 * @param systemPrompt - System instructions for the judge
 * @param model - Optional model override
 * @param criteria - Evaluation criteria for output
 * @returns Judge result with score and reasoning
 */
export async function callAnthropicJudge(
  prompt: string,
  systemPrompt: string,
  model: string | undefined,
  criteria: string,
): Promise<JudgeResult> {
  const apiKey = process.env.ANTHROPIC_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_KEY environment variable is required");
  }

  const client = new Anthropic({ apiKey });
  const judgeModel = model ?? DEFAULT_MODEL;

  printJudgeHeader("anthropic", judgeModel, criteria);

  const stream = client.messages.stream({
    model: judgeModel,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
    max_tokens: DEFAULT_MAX_TOKENS,
  });

  let text = "";

  for await (const event of stream as AsyncIterable<RawMessageStreamEvent>) {
    if (event.type === "content_block_delta") {
      const delta = event.delta;

      if (delta.type === "text_delta") {
        printJudgeChunk(delta.text);
        text += delta.text;
      }
    }
  }

  finishJudgeOutput();

  return parseJudgeResponse(text.trim());
}
