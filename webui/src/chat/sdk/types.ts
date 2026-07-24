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
  /** True for error messages persisted in history (not sent to LLM) */
  isError?: boolean;
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
    /**
     * For a spawn_subagent result: the worker's full chat history, kept for the
     * UI deep-dive. Persisted with the conversation but NEVER sent to the model
     * (buildModelMessages reads only `result`), so the orchestrator context can't
     * blow up. Absent for ordinary tool results.
     */
    subagentTranscript?: ChatMessage[];
  }>;
  reasoning?: string;
  /**
   * Structured reasoning blocks with provider signatures, captured from the
   * stream so they can be re-emitted verbatim on later turns. Re-sending the
   * signed thinking blocks keeps the Anthropic request prefix byte-stable across
   * turns, so the conversation history (incl. the ppal-connect skills result)
   * stays prompt-cached when adaptive thinking is on. `reasoning` holds the same
   * text flattened for display.
   */
  reasoningParts?: Array<{
    text: string;
    signature?: string;
    redactedData?: string;
  }>;
  /** Model ID from the API response (assistant messages only) */
  responseModel?: string;
  /** Token usage from the API response (assistant messages only) */
  usage?: TokenUsage;
  /** Per-message setting override (only present when user overrode the conversation default) */
  thinkingOverride?: string;
  /** True for a synthetic compaction summary that replaces older turns */
  isCompactionSummary?: boolean;
}

/** Token usage summary extracted from LanguageModelUsage */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  /** Cached input tokens read from a prompt cache (Anthropic + auto-caching providers) */
  cacheReadTokens?: number;
  /** Input tokens written to a prompt cache this request */
  cacheWriteTokens?: number;
}

/**
 * Convert AI SDK LanguageModelUsage to our TokenUsage type.
 * @param sdkUsage - Usage data from the AI SDK
 * @returns Token usage summary
 */
export function toTokenUsage(sdkUsage: LanguageModelUsage): TokenUsage {
  const reasoning = sdkUsage.outputTokenDetails.reasoningTokens;
  const cacheRead = sdkUsage.inputTokenDetails.cacheReadTokens;
  const cacheWrite = sdkUsage.inputTokenDetails.cacheWriteTokens;

  return {
    inputTokens: sdkUsage.inputTokens ?? undefined,
    outputTokens: sdkUsage.outputTokens ?? undefined,
    ...(reasoning != null && reasoning > 0 && { reasoningTokens: reasoning }),
    ...(cacheRead != null && cacheRead > 0 && { cacheReadTokens: cacheRead }),
    ...(cacheWrite != null &&
      cacheWrite > 0 && { cacheWriteTokens: cacheWrite }),
  };
}

/** Configuration for the AI SDK client */
export interface ChatClientConfig {
  model: LanguageModel;
  temperature?: number;
  systemInstruction?: string;
  mcpUrl?: string;
  enabledTools?: Record<string, boolean>;
  providerOptions?: ProviderOptions;
  /** Recompute provider options for a given thinking level (used for mid-conversation overrides) */
  buildProviderOptions?: (thinking: string) => ProviderOptions | undefined;
  chatHistory?: ChatMessage[];
  /**
   * Tool-step budget for streamText's stopWhen. Defaults to the shared
   * MAX_TOOL_STEPS in client.ts. A subagent worker sets MAX_WORKER_STEPS; an
   * orchestrator with subagents enabled widens to MAX_ORCHESTRATOR_STEPS.
   */
  maxSteps?: number;
}
