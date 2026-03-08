// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Evaluation session adapter — uses AI SDK for all providers.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type ModelMessage, stepCountIs, streamText } from "ai";
import { createAiSdkMcpTools } from "#evals/chat/ai-sdk-mcp.ts";
import { createProviderModel } from "#evals/chat/ai-sdk-provider.ts";
import { processCliStream } from "#evals/chat/ai-sdk-stream.ts";
import {
  ANTHROPIC_CONFIG,
  GEMINI_CONFIG,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
} from "#evals/shared/provider-configs.ts";
import { logTurnStart } from "./helpers/eval-session-base.ts";
import { type EvalProvider, type TurnResult } from "./types.ts";

const MAX_TOOL_STEPS = 10;
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Get the default model for a provider
 *
 * @param provider - The LLM provider
 * @returns Default model string for the provider
 */
export function getDefaultModel(provider: EvalProvider): string {
  switch (provider) {
    case "anthropic":
      return ANTHROPIC_CONFIG.defaultModel;
    case "google":
      return GEMINI_CONFIG.defaultModel;
    case "openai":
      return OPENAI_CONFIG.defaultModel;
    case "openrouter":
      return OPENROUTER_CONFIG.defaultModel;
    case "local":
      throw new Error(
        "No default model for local provider. Specify with -m local/model-name",
      );

    default: {
      const _exhaustiveCheck: never = provider;

      throw new Error(`Unknown provider: ${String(_exhaustiveCheck)}`);
    }
  }
}

/**
 * Session interface for evaluations
 */
export interface EvalSession {
  /** Send a message and get the response */
  sendMessage: (message: string, turnNumber: number) => Promise<TurnResult>;
  /** MCP client for state assertions */
  mcpClient: Client;
  /** Close the session */
  close: () => Promise<void>;
}

interface EvalSessionOptions {
  provider: EvalProvider;
  model?: string;
  instructions?: string;
}

/**
 * Create an evaluation session using AI SDK
 *
 * @param options - Session configuration
 * @returns Evaluation session with sendMessage and mcpClient
 */
export async function createEvalSession(
  options: EvalSessionOptions,
): Promise<EvalSession> {
  const model = createProviderModel(
    options.provider,
    options.model ?? getDefaultModel(options.provider),
  );
  const { tools, mcpClient } = await createAiSdkMcpTools();
  const hasTools = Object.keys(tools).length > 0;
  const messages: ModelMessage[] = [];

  return {
    mcpClient,

    sendMessage: async (
      message: string,
      turnNumber: number,
    ): Promise<TurnResult> => {
      logTurnStart(turnNumber, message);
      messages.push({ role: "user", content: message });

      const result = streamText({
        model,
        messages,
        tools: hasTools ? tools : undefined,
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
        maxOutputTokens: DEFAULT_MAX_TOKENS,
        system: options.instructions,
      });

      const turnResult = await processCliStream(result);

      // Append generated messages to history for multi-turn
      const response = await result.response;

      messages.push(...response.messages);

      return turnResult;
    },

    close: async () => {
      await mcpClient.close();
    },
  };
}
