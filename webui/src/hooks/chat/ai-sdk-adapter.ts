// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import { AiSdkClient } from "#webui/chat/ai-sdk/ai-sdk-client";
import {
  type AiSdkClientConfig,
  type AiSdkMessage,
} from "#webui/chat/ai-sdk/ai-sdk-types";
import { formatAiSdkMessages } from "#webui/chat/ai-sdk/formatter";
import { createProviderModel } from "#webui/chat/ai-sdk/provider-factories";
import {
  mapThinkingToOllamaThink,
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
} from "#webui/hooks/settings/config-builders";
import { SYSTEM_INSTRUCTION } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";
import { createFormattedErrorMessage } from "./helpers/streaming-helpers";
import { type ChatAdapter } from "./use-chat";

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
        openai: {
          reasoning: {
            effort,
            ...(effort === "none" || !showThoughts ? { exclude: true } : {}),
          },
        },
      };
    }

    return undefined;
  }

  if (provider === "openai") {
    const effort = mapThinkingToReasoningEffort(thinking, model);

    if (effort) {
      return { openai: { reasoningEffort: effort } };
    }

    return undefined;
  }

  return undefined;
}

/**
 * AI SDK adapter for the generic useChat hook.
 * Routes all providers through the Vercel AI SDK's streamText function.
 */
export const aiSdkAdapter: ChatAdapter<
  AiSdkClient,
  AiSdkMessage,
  AiSdkClientConfig
> = {
  createClient(apiKey: string, config: AiSdkClientConfig): AiSdkClient {
    return new AiSdkClient(apiKey, config);
  },

  buildConfig(
    model: string,
    temperature: number,
    thinking: string,
    enabledTools: Record<string, boolean>,
    chatHistory: AiSdkMessage[] | undefined,
    extraParams?: Record<string, unknown>,
  ): AiSdkClientConfig {
    const provider = extraParams?.provider as Provider;
    const baseUrl = extraParams?.baseUrl as string | undefined;
    const apiKey = extraParams?.apiKey as string;
    const showThoughts = Boolean(extraParams?.showThoughts);

    const languageModel = createProviderModel(provider, model, apiKey, baseUrl);
    const providerOptions = buildProviderOptions(
      provider,
      thinking,
      model,
      showThoughts,
    );

    return {
      model: languageModel,
      temperature,
      systemInstruction: SYSTEM_INSTRUCTION,
      enabledTools,
      showThoughts,
      providerOptions,
      chatHistory,
    };
  },

  formatMessages: formatAiSdkMessages,

  createErrorMessage(error: unknown, chatHistory: AiSdkMessage[]) {
    return createFormattedErrorMessage(chatHistory, formatAiSdkMessages, error);
  },

  extractUserMessage(message: AiSdkMessage): string | undefined {
    return message.role === "user" ? message.content.trim() : undefined;
  },

  createUserMessage(text: string): AiSdkMessage {
    return { role: "user", content: text };
  },
};
