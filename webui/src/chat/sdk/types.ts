// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import { type LanguageModel, type LanguageModelUsage } from "ai";

/**
 * Intermediate message type for the AI SDK client.
 * We use this instead of the SDK's ModelMessage because ModelMessage uses
 * union content types (string | Array<Part>) that are awkward to incrementally
 * build during streaming and to format for the UI. This flat structure is
 * simpler for both the stream processor and the UIMessage formatter.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    isError?: boolean;
  }>;
  reasoning?: string;
  /** Model ID from the API response (assistant messages only) */
  responseModel?: string;
  /** Token usage from the API response (assistant messages only) */
  usage?: TokenUsage;
  /** Per-message setting overrides (only present when user overrode conversation defaults) */
  thinkingOverride?: string;
  temperatureOverride?: number;
  showThoughtsOverride?: boolean;
}

/** Token usage summary extracted from LanguageModelUsage */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

/**
 * Convert AI SDK LanguageModelUsage to our TokenUsage type.
 * @param sdkUsage - Usage data from the AI SDK
 * @returns Token usage summary
 */
export function toTokenUsage(sdkUsage: LanguageModelUsage): TokenUsage {
  const reasoning = sdkUsage.outputTokenDetails.reasoningTokens;

  return {
    inputTokens: sdkUsage.inputTokens ?? undefined,
    outputTokens: sdkUsage.outputTokens ?? undefined,
    ...(reasoning != null && reasoning > 0 && { reasoningTokens: reasoning }),
  };
}

/** Configuration for the AI SDK client */
export interface ChatClientConfig {
  model: LanguageModel;
  temperature?: number;
  systemInstruction?: string;
  mcpUrl?: string;
  enabledTools?: Record<string, boolean>;
  showThoughts: boolean;
  providerOptions?: ProviderOptions;
  /** Recompute provider options for a given thinking level (used for mid-conversation overrides) */
  buildProviderOptions?: (thinking: string) => ProviderOptions | undefined;
  chatHistory?: ChatMessage[];
}
