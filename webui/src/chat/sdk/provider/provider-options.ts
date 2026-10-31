// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import {
  buildAnthropicProviderOptions,
  isOpenAIReasoningModel,
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
} from "#webui/chat/sdk/provider/thinking-effort";
import {
  getGeminiOffThinkingConfig,
  mapThinkingToOllamaEffort,
} from "#webui/hooks/settings/config-builders";
import { getThinkingBudget, toThinkingEffort } from "#webui/lib/config";
import { type Provider } from "#webui/types/settings";

/**
 * Build provider-specific options for reasoning/thinking.
 * Maps the Producer Pal thinking levels to AI SDK providerOptions format.
 * @param provider - Provider identifier
 * @param thinking - Thinking level from UI settings
 * @param model - Model identifier
 * @returns Provider options object for streamText
 */
export function buildProviderOptions(
  provider: Provider,
  thinking: string,
  model: string,
): ProviderOptions | undefined {
  if (provider === "anthropic") {
    return buildAnthropicOptions(thinking, model);
  }

  if (provider === "ollama") {
    const reasoningEffort = mapThinkingToOllamaEffort(thinking);

    return reasoningEffort ? { openai: { reasoningEffort } } : undefined;
  }

  if (provider === "openrouter") {
    const effort = mapThinkingToOpenRouterEffort(toThinkingEffort(thinking));

    // Default names no effort. `enabled` still turns reasoning on, which
    // models like Claude need to think (and to keep their replayed reasoning).
    return {
      openrouter: {
        reasoning: effort ? { effort } : { enabled: true },
      },
    };
  }

  if (provider === "openai") {
    return buildOpenAIOptions(thinking, model, true);
  }

  if (provider === "vercel") {
    return buildGatewayOptions(thinking, model);
  }

  if (provider === "gemini") {
    return buildGeminiOptions(thinking, model);
  }

  return undefined;
}

/**
 * Build Anthropic-specific provider options for extended thinking. The direct
 * route leaves Off and `display` to its request rewrite (provider-factories).
 * @param thinking - Thinking level from UI settings
 * @param model - Model identifier
 * @returns Anthropic provider options or undefined
 */
function buildAnthropicOptions(
  thinking: string,
  model: string,
): ProviderOptions | undefined {
  return buildAnthropicProviderOptions(toThinkingEffort(thinking), model, {
    explicitOff: false,
    summarized: false,
  });
}

/**
 * Build OpenAI-specific provider options for reasoning.
 * @param thinking - Thinking level from UI settings
 * @param model - Model identifier
 * @param direct - True on the direct OpenAI route (not via the gateway)
 * @returns OpenAI provider options or undefined
 */
function buildOpenAIOptions(
  thinking: string,
  model: string,
  direct = false,
): ProviderOptions | undefined {
  const effort = mapThinkingToReasoningEffort(
    toThinkingEffort(thinking),
    model,
  );
  // Off asks for no reasoning summaries, even on models that still reason.
  const reasoningSummary =
    thinking !== "Off" && isOpenAIReasoningModel(model) ? "auto" : undefined;

  // The SDK adds `summary: "detailed"` whenever an effort is set; null stops
  // it. Not sent via the gateway, which forwards the options untested.
  const noSummary =
    direct && thinking === "Off" && effort && isOpenAIReasoningModel(model);

  if (effort || reasoningSummary) {
    return {
      openai: {
        ...(effort ? { reasoningEffort: effort } : {}),
        ...(reasoningSummary ? { reasoningSummary } : {}),
        ...(noSummary ? { reasoningSummary: null } : {}),
      },
    };
  }

  return undefined;
}

/**
 * Build Gemini-specific provider options for thinking.
 * @param thinking - Thinking level from UI settings
 * @param model - Gemini model id, without any gateway prefix
 * @returns Google provider options or undefined
 */
function buildGeminiOptions(
  thinking: string,
  model: string,
): ProviderOptions | undefined {
  const thinkingBudget = getThinkingBudget(thinking);

  if (thinkingBudget === 0) {
    const thinkingConfig = getGeminiOffThinkingConfig(model);

    return thinkingConfig ? { google: { thinkingConfig } } : undefined;
  }

  // Default sends no budget (-1), so Gemini picks its own; only the thought
  // summaries are requested.
  return {
    google: {
      thinkingConfig: {
        ...(thinkingBudget >= 0 ? { thinkingBudget } : {}),
        includeThoughts: true,
      },
    },
  };
}

/**
 * Build Vercel AI Gateway options. The gateway forwards each upstream
 * provider's own options, so the upstream comes from the model id
 * (`anthropic/claude-sonnet-5.5`). Always turns on the gateway's prompt caching,
 * which places Anthropic cache breakpoints for us.
 * @param thinking - Thinking level from UI settings
 * @param model - Gateway model id (`provider/model`)
 * @returns Gateway plus upstream provider options
 */
function buildGatewayOptions(thinking: string, model: string): ProviderOptions {
  const slash = model.indexOf("/");

  // A custom id with no `provider/` prefix has no upstream to pick options for.
  if (slash < 0) {
    return { gateway: { caching: "auto" } };
  }

  const upstream = model.slice(0, slash);
  const upstreamModel = model.slice(slash + 1);

  return {
    gateway: { caching: "auto" },
    ...buildGatewayUpstreamOptions(upstream, thinking, upstreamModel),
  };
}

/**
 * Thinking options for the gateway's upstream provider.
 * @param upstream - Upstream provider slug (`anthropic`, `openai`, `google`)
 * @param thinking - Thinking level from UI settings
 * @param model - Model id without the upstream prefix
 * @returns Upstream provider options, or undefined when it has none
 */
function buildGatewayUpstreamOptions(
  upstream: string,
  thinking: string,
  model: string,
): ProviderOptions | undefined {
  switch (upstream) {
    case "anthropic":
      return buildGatewayAnthropicOptions(thinking, model);
    case "openai":
      return buildOpenAIOptions(thinking, model);
    case "google":
      return buildGeminiOptions(thinking, model);
    default:
      return undefined;
  }
}

/**
 * Anthropic options through the gateway. The direct provider gets summarized
 * thinking and an explicit "Off" type from its request rewrite, which can't
 * reach the gateway's wire format, so ask for both here.
 * @param thinking - Thinking level from UI settings
 * @param model - Anthropic model id
 * @returns Anthropic provider options or undefined
 */
function buildGatewayAnthropicOptions(
  thinking: string,
  model: string,
): ProviderOptions | undefined {
  return buildAnthropicProviderOptions(toThinkingEffort(thinking), model, {
    explicitOff: true,
    summarized: true,
  });
}
