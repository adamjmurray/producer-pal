// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import {
  isAdaptiveByDefaultModel,
  isLegacyNonThinkingModel,
  isLegacyThinkingModel,
  isOpenAIReasoningModel,
  mapThinkingToAnthropicEffort,
  mapThinkingToOllamaThink,
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
} from "#webui/hooks/settings/config-builders";
import { getThinkingBudget } from "#webui/lib/config";
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

  if (provider === "vercel") {
    return buildGatewayOptions(thinking, model);
  }

  if (provider === "gemini") {
    return buildGeminiOptions(thinking);
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
  if (isLegacyNonThinkingModel(model)) {
    return undefined;
  }

  // Legacy path for models that don't support adaptive thinking (Haiku 4.5)
  if (isLegacyThinkingModel(model)) {
    const budgetTokens = getThinkingBudget(thinking);

    if (budgetTokens === 0) {
      return undefined;
    }

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

  if (effort == null) {
    return undefined;
  }

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
 * Build Gemini-specific provider options for thinking.
 * @param thinking - Thinking level from UI settings
 * @returns Google provider options or undefined
 */
function buildGeminiOptions(thinking: string): ProviderOptions | undefined {
  const thinkingBudget = getThinkingBudget(thinking);

  if (thinkingBudget === 0) {
    return undefined;
  }

  return {
    google: { thinkingConfig: { thinkingBudget, includeThoughts: true } },
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
      return buildGeminiOptions(thinking);
    default:
      return undefined;
  }
}

/**
 * Anthropic options through the gateway. The direct provider gets these two
 * from its request rewrite, which can't reach the gateway's wire format:
 * summarized thinking (adaptive thinking shows nothing without it), and an
 * explicit `disabled` for "Off" (omitting `thinking` runs adaptive thinking on
 * Sonnet 5+).
 * @param thinking - Thinking level from UI settings
 * @param model - Anthropic model id
 * @returns Anthropic provider options or undefined
 */
function buildGatewayAnthropicOptions(
  thinking: string,
  model: string,
): ProviderOptions | undefined {
  const options = buildAnthropicOptions(thinking, model);
  const anthropic = options?.anthropic as
    | { thinking: { type: string } }
    | undefined;

  if (anthropic?.thinking.type === "adaptive") {
    return {
      anthropic: {
        ...anthropic,
        thinking: { ...anthropic.thinking, display: "summarized" },
      },
    };
  }

  if (options == null && isAdaptiveByDefaultModel(model)) {
    return { anthropic: { thinking: { type: "disabled" } } };
  }

  return options;
}
