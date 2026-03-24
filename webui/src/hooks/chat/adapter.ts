// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import { formatChatMessages } from "#webui/chat/sdk/formatter";
import { createProviderModel } from "#webui/chat/sdk/provider-factories";
import { type ChatClientConfig, type ChatMessage } from "#webui/chat/sdk/types";
import {
  isOpenAIReasoningModel,
  mapThinkingToOllamaThink,
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
} from "#webui/hooks/settings/config-builders";
import { SYSTEM_INSTRUCTION, getThinkingBudget } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";
import { createFormattedErrorMessage } from "./helpers/streaming-helpers";
import { type ChatAdapter } from "./use-chat-types";

/**
 * Build provider-specific options for reasoning/thinking.
 * Maps the Producer Pal thinking levels to AI SDK providerOptions format.
 * @param provider - Provider identifier
 * @param thinking - Thinking level from UI settings
 * @param model - Model identifier
 * @param showThoughts - Whether to include reasoning in response
 * @returns Provider options object for streamText
 */
function buildProviderOptions(
  provider: Provider,
  thinking: string,
  model: string,
  showThoughts: boolean,
): ProviderOptions | undefined {
  if (provider === "anthropic") {
    return buildAnthropicOptions(thinking);
  }

  if (provider === "ollama") {
    const ollamaThink = mapThinkingToOllamaThink(thinking, model);

    if (ollamaThink != null) {
      return { openai: { think: ollamaThink } };
    }

    return undefined;
  }

  if (provider === "openrouter") {
    const effort = mapThinkingToOpenRouterEffort(thinking);

    if (effort) {
      return {
        openrouter: {
          reasoning: {
            effort,
            ...(!showThoughts ? { exclude: true } : {}),
          },
        },
      };
    }

    return undefined;
  }

  if (provider === "openai") {
    return buildOpenAIOptions(thinking, model, showThoughts);
  }

  if (provider === "gemini") {
    const thinkingBudget = getThinkingBudget(thinking);

    if (thinkingBudget !== 0) {
      return {
        google: {
          thinkingConfig: {
            thinkingBudget,
            includeThoughts: showThoughts,
          },
        },
      };
    }

    return undefined;
  }

  return undefined;
}

/**
 * Build Anthropic-specific provider options for extended thinking.
 * @param thinking - Thinking level from UI settings
 * @returns Anthropic provider options or undefined
 */
function buildAnthropicOptions(thinking: string): ProviderOptions | undefined {
  const thinkingBudget = getThinkingBudget(thinking);

  if (thinkingBudget === 0) return undefined;

  return {
    anthropic: {
      thinking: {
        type: "enabled",
        budgetTokens: thinkingBudget === -1 ? 10240 : thinkingBudget,
      },
    },
  };
}

/**
 * Build OpenAI-specific provider options for reasoning.
 * @param thinking - Thinking level from UI settings
 * @param model - Model identifier
 * @param showThoughts - Whether to include reasoning summaries
 * @returns OpenAI provider options or undefined
 */
function buildOpenAIOptions(
  thinking: string,
  model: string,
  showThoughts: boolean,
): ProviderOptions | undefined {
  const effort = mapThinkingToReasoningEffort(thinking, model);
  const reasoningSummary =
    showThoughts && isOpenAIReasoningModel(model) ? "auto" : undefined;

  if (effort || reasoningSummary) {
    return {
      openai: {
        ...(effort ? { reasoningEffort: effort } : {}),
        ...(reasoningSummary ? { reasoningSummary } : {}),
      },
    };
  }

  return undefined;
}

/**
 * AI SDK adapter for the generic useChat hook.
 * Routes all providers through the Vercel AI SDK's streamText function.
 */
export const chatAdapter: ChatAdapter<
  ChatSdkClient,
  ChatMessage,
  ChatClientConfig
> = {
  createClient(apiKey: string, config: ChatClientConfig): ChatSdkClient {
    return new ChatSdkClient(apiKey, config);
  },

  buildConfig(
    model: string,
    temperature: number,
    thinking: string,
    enabledTools: Record<string, boolean>,
    chatHistory: ChatMessage[] | undefined,
    extraParams?: Record<string, unknown>,
  ): ChatClientConfig {
    const provider = extraParams?.provider as Provider;
    const baseUrl = extraParams?.baseUrl as string | undefined;
    const apiKey = extraParams?.apiKey as string;
    // When thinking is Off, always exclude reasoning tokens even if the model generates them.
    // The stored showThoughts setting is preserved for when the UI toggle is re-introduced.
    const showThoughts =
      thinking !== "Off" && Boolean(extraParams?.showThoughts);

    const languageModel = createProviderModel(provider, model, apiKey, baseUrl);
    const providerOptions = buildProviderOptions(
      provider,
      thinking,
      model,
      showThoughts,
    );

    const suppressTemperature =
      (provider === "openai" && isOpenAIReasoningModel(model)) ||
      (provider === "anthropic" && getThinkingBudget(thinking) !== 0);

    return {
      model: languageModel,
      temperature: suppressTemperature ? undefined : temperature,
      systemInstruction: SYSTEM_INSTRUCTION,
      enabledTools,
      showThoughts,
      providerOptions,
      buildProviderOptions: (overrideThinking: string) =>
        buildProviderOptions(provider, overrideThinking, model, showThoughts),
      chatHistory,
    };
  },

  formatMessages: formatChatMessages,

  createErrorMessage(error: unknown, chatHistory: ChatMessage[]) {
    return createFormattedErrorMessage(chatHistory, formatChatMessages, error);
  },

  extractUserMessage(message: ChatMessage): string | undefined {
    return message.role === "user" ? message.content.trim() : undefined;
  },

  createUserMessage(text: string): ChatMessage {
    return { role: "user", content: text };
  },
};
