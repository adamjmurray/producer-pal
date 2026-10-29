// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: MIT

/**
 * Unified AI SDK judge for evaluations — handles all providers via a single code path.
 */

import { streamText } from "ai";
import { getAgentCliTransport } from "#evals/chat/agent-cli/agent-cli-registry.ts";
import { createProviderModel } from "#evals/chat/provider.ts";
import { getDefaultModel } from "#evals/scenarios/eval-session.ts";
import { type EvalProvider } from "#evals/scenarios/types.ts";
import { callAgentCliJudge } from "./agent-cli-judge.ts";
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
  const agentCli = getAgentCliTransport(provider);
  const judgeModel = resolveJudgeModel(provider, model);

  if (agentCli != null) {
    return await callAgentCliJudge(
      agentCli,
      prompt,
      systemPrompt,
      judgeModel,
      criteria,
    );
  }

  const languageModel = createProviderModel(provider, judgeModel);

  printJudgeHeader(provider, judgeModel, criteria);

  const result = streamText({
    model: languageModel,
    instructions: systemPrompt,
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

/**
 * The model a judge call uses for a provider.
 *
 * @param provider - LLM provider
 * @param model - Optional model override
 * @returns The override, else the provider's judge or default model
 */
export function resolveJudgeModel(
  provider: EvalProvider,
  model: string | undefined,
): string {
  // Agent CLIs judge with an isolated model, distinct from the one under test,
  // to avoid self-grading. Their session default is that model, so it must not
  // be used here.
  const agentCli = getAgentCliTransport(provider);

  return model ?? agentCli?.judgeModel ?? getDefaultModel(provider);
}
