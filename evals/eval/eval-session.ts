// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Evaluation session adapter - wraps chat-lib providers for evaluation
 */

import { GoogleGenAI, mcpToTool } from "@google/genai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectMcp } from "#evals/chat/shared/mcp.ts";
import { printGeminiStream } from "#evals/shared/gemini-streaming.ts";
import type { GeminiResponse } from "#evals/shared/gemini-types.ts";
import {
  ANTHROPIC_CONFIG,
  GEMINI_CONFIG,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
  validateApiKey,
  type OpenAIProviderConfig,
} from "#evals/shared/provider-configs.ts";
import { createAnthropicEvalSession } from "./helpers/anthropic-session.ts";
import { logTurnStart } from "./helpers/eval-session-base.ts";
import { createOpenAIEvalSession } from "./helpers/openai-session.ts";
import type { EvalProvider, TurnResult } from "./types.ts";

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

    default: {
      const _exhaustiveCheck: never = provider;

      throw new Error(`Unknown provider: ${String(_exhaustiveCheck)}`);
    }
  }
}

type ChatSession = ReturnType<GoogleGenAI["chats"]["create"]>;

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
 * Create an evaluation session
 *
 * @param options - Session configuration
 * @returns Evaluation session with sendMessage and mcpClient
 */
export async function createEvalSession(
  options: EvalSessionOptions,
): Promise<EvalSession> {
  const { client: mcpClient } = await connectMcp();

  switch (options.provider) {
    case "anthropic":
      return await createAnthropicProviderSession(mcpClient, options);
    case "google":
      return await createGeminiSession(mcpClient, options);
    case "openai":
      return await createOpenAIProviderSession(
        mcpClient,
        OPENAI_CONFIG,
        options,
      );
    case "openrouter":
      return await createOpenAIProviderSession(
        mcpClient,
        OPENROUTER_CONFIG,
        options,
      );

    default: {
      const _exhaustiveCheck: never = options.provider;

      throw new Error(`Unknown provider: ${String(_exhaustiveCheck)}`);
    }
  }
}

/**
 * Create a Gemini-based evaluation session
 *
 * @param mcpClient - MCP client for tool calls
 * @param options - Session configuration
 * @returns Evaluation session
 */
async function createGeminiSession(
  mcpClient: Client,
  options: EvalSessionOptions,
): Promise<EvalSession> {
  const apiKey = validateApiKey(GEMINI_CONFIG);
  const ai = new GoogleGenAI({ apiKey });
  const model = options.model ?? GEMINI_CONFIG.defaultModel;

  const config: Record<string, unknown> = {
    tools: [mcpToTool(mcpClient)],
    automaticFunctionCalling: {},
  };

  if (options.instructions) {
    config.systemInstruction = options.instructions;
  }

  const chatSession = ai.chats.create({ model, config });

  return {
    mcpClient,
    sendMessage: (message: string, turnNumber: number) =>
      sendGeminiMessage(chatSession, message, turnNumber),
    close: async () => {
      await mcpClient.close();
    },
  };
}

/**
 * Send a message via Gemini with streaming output
 *
 * @param chatSession - The Gemini chat session
 * @param message - User message to send
 * @param turnNumber - Current turn number for logging
 * @returns Turn result with text and tool calls
 */
async function sendGeminiMessage(
  chatSession: ChatSession,
  message: string,
  turnNumber: number,
): Promise<TurnResult> {
  logTurnStart(turnNumber, message);
  const stream = await chatSession.sendMessageStream({ message });

  return await printGeminiStream(stream as AsyncIterable<GeminiResponse>);
}

/** Minimal session interface for wrapping */
interface WrappableSession {
  sendMessage: EvalSession["sendMessage"];
  close: () => Promise<void>;
}

/**
 * Wrap a provider session into an EvalSession
 *
 * @param mcpClient - MCP client for tool calls
 * @param session - Provider session to wrap
 * @returns Evaluation session
 */
function wrapSession(
  mcpClient: Client,
  session: WrappableSession,
): EvalSession {
  return {
    mcpClient,
    sendMessage: session.sendMessage,
    close: async () => {
      await session.close();
      await mcpClient.close();
    },
  };
}

/**
 * Create an Anthropic evaluation session
 *
 * @param mcpClient - MCP client for tool calls
 * @param options - Session configuration
 * @returns Evaluation session
 */
async function createAnthropicProviderSession(
  mcpClient: Client,
  options: EvalSessionOptions,
): Promise<EvalSession> {
  const session = await createAnthropicEvalSession(mcpClient, {
    model: options.model,
    instructions: options.instructions,
  });

  return wrapSession(mcpClient, session);
}

/**
 * Create an OpenAI-compatible evaluation session
 *
 * @param mcpClient - MCP client for tool calls
 * @param config - Provider configuration
 * @param options - Session configuration
 * @returns Evaluation session
 */
async function createOpenAIProviderSession(
  mcpClient: Client,
  config: OpenAIProviderConfig,
  options: EvalSessionOptions,
): Promise<EvalSession> {
  const session = await createOpenAIEvalSession(mcpClient, config, {
    model: options.model,
    instructions: options.instructions,
  });

  return wrapSession(mcpClient, session);
}
