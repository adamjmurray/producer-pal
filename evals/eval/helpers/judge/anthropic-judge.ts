// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Anthropic LLM judge for evaluations
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RawMessageStreamEvent } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  ANTHROPIC_CONFIG,
  validateApiKey,
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
  const apiKey = validateApiKey(ANTHROPIC_CONFIG);
  const client = new Anthropic({ apiKey });
  const judgeModel = model ?? ANTHROPIC_CONFIG.defaultModel;

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

  const result = parseJudgeResponse(text.trim());

  printJudgeResult(result);

  return result;
}
