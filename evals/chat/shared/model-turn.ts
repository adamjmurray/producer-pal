// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * One model turn over the AI SDK: stream the response, print it, and collect
 * what the caller needs to carry the conversation forward. Shared by the
 * interactive chat and the scenario session.
 */

import {
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  stepCountIs,
  streamText,
} from "ai";
import { MAX_TOOL_STEPS } from "#evals/shared/step-budget.ts";
import {
  type StepTiming,
  type TokenUsage,
  toStepTiming,
  toTokenUsage,
} from "#webui/chat/sdk/types.ts";
import { processCliStream } from "../stream.ts";
import { type TurnResult } from "./types.ts";

export const DEFAULT_MAX_TOKENS = 8192;

export interface ModelTurnParams {
  model: LanguageModel;
  /** History so far, ending with the user message for this turn. */
  messages: ModelMessage[];
  tools: ToolSet;
  /** Ids of tool calls whose MCP result was an error (see createMcpTools). */
  erroredToolCallIds: Set<string>;
  /** Last step's usage from the previous turn, for the "new content" figure. */
  prevUsage?: TokenUsage | undefined;
  showUsage?: boolean | undefined;
  instructions?: string | undefined;
  providerOptions?: Parameters<typeof streamText>[0]["providerOptions"];
  temperature?: number | undefined;
  maxOutputTokens?: number | undefined;
}

export interface ModelTurn {
  turnResult: TurnResult;
  stepUsages: TokenUsage[];
  /** One entry per step, empty when nothing was measurable. */
  stepTimings: StepTiming[];
  /** Pass as the next turn's `prevUsage`. */
  lastUsage: TokenUsage | undefined;
  /**
   * What the model generated, to append to the history. Empty after a stream
   * error: the error was already shown, and the response has nothing to read.
   */
  responseMessages: ModelMessage[];
}

/**
 * Run one streamed model turn.
 *
 * @param params - Model, history, tools and per-turn settings
 * @returns The turn's result, per-step stats and the messages to append
 */
export async function runModelTurn(
  params: ModelTurnParams,
): Promise<ModelTurn> {
  const stepUsages: TokenUsage[] = [];
  const stepTimings: StepTiming[] = [];

  const result = streamText({
    model: params.model,
    messages: params.messages,
    tools: Object.keys(params.tools).length > 0 ? params.tools : undefined,
    stopWhen: stepCountIs(MAX_TOOL_STEPS),
    providerOptions: params.providerOptions,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
    instructions: params.instructions,
    // Errors are rendered (in red) by processCliStream via the stream's
    // "error" part; suppress the SDK's default raw dump.
    onError: () => {},
    // The usage line itself is printed by processCliStream, off the
    // finish-step part that carries both usage and timings.
    onStepEnd: (event) => {
      stepUsages.push(toTokenUsage(event.usage));
      // Empty when nothing was measurable, so the two arrays stay aligned and
      // each rate keeps the step's output tokens as its weight.
      stepTimings.push(toStepTiming(event.performance) ?? {});
    },
  });

  const turnResult = await processCliStream(result, {
    showUsage: params.showUsage,
    prevUsage: params.prevUsage,
    erroredToolCallIds: params.erroredToolCallIds,
  });
  const lastUsage = stepUsages.at(-1) ?? params.prevUsage;

  // On a stream error, result.responseMessages rejects.
  if (turnResult.error != null) {
    return {
      turnResult,
      stepUsages,
      stepTimings,
      lastUsage,
      responseMessages: [],
    };
  }

  // responseMessages accumulates across every step: as of AI SDK v7 a step's
  // response.messages holds only that step's messages, so reading the final
  // step alone would drop earlier tool calls and results from the next turn.
  return {
    turnResult,
    stepUsages,
    stepTimings,
    lastUsage,
    responseMessages: await result.responseMessages,
  };
}
