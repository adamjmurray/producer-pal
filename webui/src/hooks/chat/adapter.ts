// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import { ChatSdkClient } from "#webui/chat/sdk/client";
import { formatChatMessages } from "#webui/chat/sdk/formatter";
import { createProviderModel } from "#webui/chat/sdk/provider-factories";
import {
  type ChatClientConfig,
  type ChatMessage,
  type SubagentConfigOverride,
} from "#webui/chat/sdk/types";
import { resolveLockedNotation } from "#webui/hooks/chat/helpers/streaming-helpers";
import {
  isLegacyNonThinkingModel,
  isLegacyThinkingModel,
  isOpenAIReasoningModel,
  mapThinkingToAnthropicEffort,
  mapThinkingToOllamaThink,
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
} from "#webui/hooks/settings/config-builders";
import {
  type ResolvedSubagentPreset,
  SUBAGENT_PRESET_PARAM,
} from "#webui/hooks/settings/presets/preset-extra-params";
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
 * @returns Provider options object for streamText
 */
function buildProviderOptions(
  provider: Provider,
  thinking: string,
  model: string,
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
          },
        },
      };
    }

    return undefined;
  }

  if (provider === "openai") {
    return buildOpenAIOptions(thinking, model);
  }

  if (provider === "gemini") {
    const thinkingBudget = getThinkingBudget(thinking);

    if (thinkingBudget !== 0) {
      return {
        google: {
          thinkingConfig: {
            thinkingBudget,
            includeThoughts: true,
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
 * @returns OpenAI provider options or undefined
 */
function buildOpenAIOptions(
  thinking: string,
  model: string,
): ProviderOptions | undefined {
  const effort = mapThinkingToReasoningEffort(thinking, model);
  // Off thinking suppresses reasoning summaries even for reasoning models that
  // generate reasoning internally — matching the openrouter/gemini paths, which
  // return no reasoning options when thinking is Off.
  const reasoningSummary =
    thinking !== "Off" && isOpenAIReasoningModel(model) ? "auto" : undefined;

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
 * Build the model/inference override a spawned worker runs under from the
 * user's resolved "Subagent preset". Returns undefined to inherit the
 * orchestrator config (no preset chosen). A preset that can't build a model
 * (e.g. a `custom` provider missing its base URL) must NOT break the
 * orchestrator's own chat init, so failures warn and fall back to inherit.
 * @param preset - The resolved subagent preset, or undefined to inherit
 * @returns The worker override, or undefined to inherit
 */
function buildSubagentConfig(
  preset: ResolvedSubagentPreset | undefined,
): SubagentConfigOverride | undefined {
  if (preset == null) return undefined;

  try {
    return {
      model: createProviderModel(
        preset.provider,
        preset.model,
        preset.apiKey,
        preset.baseUrl,
      ),
      smallModelMode: preset.smallModelMode,
      providerOptions: buildProviderOptions(
        preset.provider,
        preset.thinking,
        preset.model,
      ),
      buildProviderOptions: (overrideThinking: string) =>
        buildProviderOptions(preset.provider, overrideThinking, preset.model),
      // Carry the preset's toolset through; buildWorkerConfig replaces the
      // worker's tools with it (and always re-strips spawn_subagent).
      enabledTools: preset.enabledTools,
      // And its notation, which reaches the worker's MCP requests and its
      // briefing fetch as the per-request header — so a stark worker can serve a
      // bar|beat orchestrator without either one touching the device global.
      // Conditional, not `notation: preset.notation`: buildWorkerConfig spreads
      // this whole object over the clone, so a present-but-undefined key would
      // erase an inherited notation rather than leaving it alone.
      ...(preset.notation ? { notation: preset.notation } : {}),
    };
  } catch (error) {
    console.warn(
      "Subagent preset could not be built; subagents will inherit " +
        `the current settings. ${error instanceof Error ? error.message : String(error)}`,
    );

    return undefined;
  }
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
    // Carried onto the config so client.initialize sends it as the per-request
    // MCP header (schema shrink + basic skills variant for this caller).
    const smallModelMode = Boolean(extraParams?.smallModelMode);
    // Same idea for notation, which the chat also sends per-request rather than
    // letting every call fall through to the device global — otherwise flipping
    // the dropdown re-teaches an open conversation mid-turn and the next tool
    // call parses its notes as something else. A restored conversation passes its
    // locked snapshot (lockedNotation) so continuing it keeps parsing the way it
    // was written; a brand-new one takes the current setting. Null when neither
    // exists: no header, device global wins, external MCP clients unaffected.
    const notation = resolveLockedNotation(extraParams ?? {});

    const languageModel = createProviderModel(provider, model, apiKey, baseUrl);
    const providerOptions = buildProviderOptions(provider, thinking, model);
    // Resolve the "Subagent preset" (if any) to the model/inference a
    // spawned worker runs under; buildWorkerConfig layers it over the clone.
    const subagentConfig = buildSubagentConfig(
      extraParams?.[SUBAGENT_PRESET_PARAM] as
        ResolvedSubagentPreset | undefined,
    );

    // Temperature is no longer sent: it was phased-out dead config (no UI, pinned
    // at 1.0) so the request now carries no `temperature` and each provider
    // applies its own default. Adaptive Anthropic / OpenAI reasoning models — the
    // ones that 400 on a non-default temperature — are satisfied by sending none.

    return {
      model: languageModel,
      systemInstruction,
      enabledTools,
      smallModelMode,
      providerOptions,
      buildProviderOptions: (overrideThinking: string) =>
        buildProviderOptions(provider, overrideThinking, model),
      chatHistory,
      subagentConfig,
      // Conditional: ChatClientConfig.notation is optional and a present-but-
      // undefined key would still be read as "the caller has an opinion".
      ...(notation ? { notation } : {}),
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
