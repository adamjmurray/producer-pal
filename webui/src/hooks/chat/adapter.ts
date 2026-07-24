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
  isLegacyNonThinkingModel,
  isLegacyThinkingModel,
  isOpenAIReasoningModel,
  mapThinkingToAnthropicEffort,
  mapThinkingToOllamaThink,
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
} from "#webui/hooks/settings/config-builders";
import { getThinkingBudget, resolveSystemInstruction } from "#webui/lib/config";
import { normalizeErrorMessage } from "#webui/lib/error-formatters";
import { type Provider } from "#webui/types/settings";
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
    return buildAnthropicOptions(thinking, model);
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
 * Uses adaptive thinking with effort for most models, falls back to legacy
 * enabled+budgetTokens for Haiku 4.5 which doesn't support adaptive yet, and
 * omits the `thinking` field entirely for pre-3.7 models that don't support it.
 * @param thinking - Thinking level from UI settings
 * @param model - Model identifier
 * @returns Anthropic provider options or undefined
 */
function buildAnthropicOptions(
  thinking: string,
  model: string,
): ProviderOptions | undefined {
  // Pre-3.7 Anthropic models (reachable only via the free-text "Other..." input)
  // reject ANY `thinking` field with a 400, so never send one regardless of the
  // UI thinking level — otherwise the default adaptive payload 400s on first send.
  if (isLegacyNonThinkingModel(model)) return undefined;

  // Legacy path for models that don't support adaptive thinking (Haiku 4.5)
  if (isLegacyThinkingModel(model)) {
    const budgetTokens = getThinkingBudget(thinking);

    if (budgetTokens === 0) return undefined;

    return {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: budgetTokens === -1 ? 10240 : budgetTokens,
        },
      },
    };
  }

  // Adaptive thinking with effort for Sonnet 4.6+, Opus 4.6+
  const effort = mapThinkingToAnthropicEffort(thinking);

  if (effort == null) return undefined;

  return {
    anthropic: {
      thinking: { type: "adaptive" },
      effort,
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
    // Full-replace custom system prompt (~/.producer-pal/system-prompt.md): any
    // non-blank content wholly replaces the built-in instruction; blank/absent
    // falls back to the default. A restored conversation passes its locked
    // snapshot (lockedSystemInstruction) so continuing it keeps sending what it
    // started with, even after the global override changes; a brand-new
    // conversation has none and resolves the current override instead.
    const systemInstructionOverride = extraParams?.systemInstructionOverride as
      string | undefined;
    const lockedSystemInstruction = extraParams?.lockedSystemInstruction as
      string | null | undefined;
    const systemInstruction =
      lockedSystemInstruction ??
      resolveSystemInstruction(systemInstructionOverride);
    // When thinking is Off, always exclude reasoning tokens even if the model generates them.
    // The stored showThoughts setting is preserved for when the UI toggle is re-introduced.
    const showThoughts =
      thinking !== "Off" && Boolean(extraParams?.showThoughts);
    // Carried onto the config so client.initialize sends it as the per-request
    // MCP header (schema shrink + basic skills variant for this caller).
    const smallModelMode = Boolean(extraParams?.smallModelMode);

    const languageModel = createProviderModel(provider, model, apiKey, baseUrl);
    const providerOptions = buildProviderOptions(
      provider,
      thinking,
      model,
      showThoughts,
    );

    // Adaptive-family Anthropic models (Sonnet 5, Opus 4.6+, Fable) reject any
    // non-default sampling parameter with a 400 — suppress temperature for them
    // regardless of thinking level, including "Off". Haiku uses legacy enabled
    // thinking, which requires temperature=1 only when thinking is active, so
    // suppress there only when thinking is on; "Off" on Haiku keeps temperature.
    // Pre-3.7 models (via the "Other..." input) support temperature normally and
    // aren't adaptive, so always keep it — dropping it there was a regression.
    const suppressTemperature =
      (provider === "openai" && isOpenAIReasoningModel(model)) ||
      (provider === "anthropic" &&
        !isLegacyNonThinkingModel(model) &&
        (!isLegacyThinkingModel(model) || thinking !== "Off"));

    return {
      model: languageModel,
      temperature: suppressTemperature ? undefined : temperature,
      systemInstruction,
      enabledTools,
      smallModelMode,
      showThoughts,
      providerOptions,
      buildProviderOptions: (overrideThinking: string) =>
        buildProviderOptions(provider, overrideThinking, model, showThoughts),
      chatHistory,
    };
  },

  formatMessages: formatChatMessages,

  createErrorMessage(error: unknown, chatHistory: ChatMessage[]) {
    chatHistory.push({
      role: "assistant",
      content: normalizeErrorMessage(error),
      isError: true,
    });

    return formatChatMessages(chatHistory);
  },

  extractUserMessage(message: ChatMessage): string | undefined {
    return message.role === "user" ? message.content.trim() : undefined;
  },

  createUserMessage(text: string): ChatMessage {
    return { role: "user", content: text };
  },

  createCompactionSummary(summary: string): ChatMessage {
    return { role: "user", content: summary, isCompactionSummary: true };
  },
};
