// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Unified AI SDK judge for evaluations — handles all providers via a single code path.
 */

import { streamText } from "ai";
import { createProviderModel } from "#evals/chat/provider.ts";
import { getDefaultModel } from "#evals/scenarios/eval-session.ts";
import { type EvalProvider } from "#evals/scenarios/types.ts";
import {
  finishJudgeOutput,
  printJudgeChunk,
  printJudgeHeader,
} from "./judge-output.ts";

/**
 * Call an LLM judge via the AI SDK with streaming output.
 * Returns the raw text response — caller is responsible for parsing.
 *
 * @param prompt - The evaluation prompt
 * @param systemPrompt - System instructions for the judge
 * @param provider - LLM provider to use
 * @param model - Optional model override (falls back to provider default)
 * @param criteria - Evaluation criteria for output display
 * @returns Raw text response from the judge LLM
 */
export async function callJudge(
  prompt: string,
  systemPrompt: string,
  provider: EvalProvider,
  model: string | undefined,
  criteria: string,
): Promise<string> {
  const judgeModel = model ?? getDefaultModel(provider);
  const languageModel = createProviderModel(provider, judgeModel);

  printJudgeHeader(provider, judgeModel, criteria);

  const result = streamText({
    model: languageModel,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  let text = "";

  for await (const chunk of result.textStream) {
    printJudgeChunk(chunk);
    text += chunk;
  }

  finishJudgeOutput();

  return text.trim();
}
