// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Maps CLI --thinking levels to AI SDK providerOptions per provider.
 */

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import { type EvalProvider } from "#evals/scenarios/types.ts";
import { type ThinkingLevel } from "./shared/types.ts";

/** Anthropic effort levels for adaptive thinking */
const ANTHROPIC_EFFORT_MAP: Record<string, string> = {
  off: "none",
  low: "low",
  medium: "medium",
  high: "high",
  ultra: "max",
};

/** Gemini thinking token budgets by level */
const GEMINI_THINKING_MAP: Record<string, number> = {
  off: 0,
  low: 2048,
  medium: 4096,
  high: 8192,
  ultra: 16384,
};

/** OpenAI reasoning effort levels */
const OPENAI_EFFORT_MAP: Record<string, string> = {
  off: "none",
  low: "low",
  medium: "medium",
  high: "high",
};

/** OpenRouter reasoning effort levels */
const OPENROUTER_EFFORT_MAP: Record<string, string> = {
  off: "none",
  low: "low",
  medium: "medium",
  high: "high",
  ultra: "xhigh",
};

/**
 * Build AI SDK providerOptions for the given provider and thinking level
 *
 * @param provider - The LLM provider
 * @param thinking - CLI thinking level (e.g., "medium", "high", "4096")
 * @param model - Model id; picks the upstream provider for the Vercel gateway
 * @returns ProviderOptions for streamText, or undefined if no thinking config
 */
export function buildProviderOptions(
  provider: EvalProvider,
  thinking: ThinkingLevel | undefined,
  model: string,
): ProviderOptions | undefined {
  if (thinking == null) {
    return undefined;
  }

  const level = String(thinking);

  switch (provider) {
    case "anthropic":
      return buildAnthropicThinking(level);
    case "google":
      return buildGeminiThinking(level);
    case "openai":
      return buildOpenAIThinking(level);
    case "openrouter":
      return buildOpenRouterThinking(level);
    case "vercel":
      return (
        buildGatewayThinking(level, model) ?? warnGatewayIgnored(level, model)
      );
    case "local":
      return undefined;
    // The agent CLIs carry their own reasoning configuration.
    case "claude-code":
    case "codex-code":
      return undefined;

    default: {
      const _exhaustiveCheck: never = provider;

      throw new Error(`Unknown provider: ${String(_exhaustiveCheck)}`);
    }
  }
}

/**
 * Build Anthropic thinking provider options using adaptive thinking with effort.
 *
 * @param level - Thinking level string
 * @returns Provider options with anthropic thinking and effort config
 */
function buildAnthropicThinking(level: string): ProviderOptions | undefined {
  const effort = ANTHROPIC_EFFORT_MAP[level];

  if (!effort || effort === "none") {
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
 * Build Gemini thinking provider options
 *
 * @param level - Thinking level string
 * @returns Provider options with google thinkingConfig
 */
function buildGeminiThinking(level: string): ProviderOptions | undefined {
  const thinkingBudget = resolveBudget(level, GEMINI_THINKING_MAP);

  if (thinkingBudget == null || thinkingBudget === 0) {
    return undefined;
  }

  return {
    google: {
      thinkingConfig: { thinkingBudget, includeThoughts: true },
    },
  };
}

/**
 * Build OpenAI thinking provider options
 *
 * @param level - Thinking level string
 * @returns Provider options with openai reasoningEffort
 */
function buildOpenAIThinking(level: string): ProviderOptions | undefined {
  const effort = OPENAI_EFFORT_MAP[level];

  if (!effort || effort === "none") {
    return undefined;
  }

  return { openai: { reasoningEffort: effort } };
}

/**
 * Build OpenRouter thinking provider options
 *
 * @param level - Thinking level string
 * @returns Provider options with openrouter reasoning
 */
function buildOpenRouterThinking(level: string): ProviderOptions | undefined {
  const effort = OPENROUTER_EFFORT_MAP[level];

  if (!effort || effort === "none") {
    return undefined;
  }

  return { openrouter: { reasoning: { effort } } };
}

/**
 * Build Vercel AI Gateway thinking options. The gateway forwards each
 * provider's own options, so use the upstream provider from the model id
 * (`anthropic/claude-sonnet-5.5`).
 *
 * @param level - Thinking level string
 * @param model - Gateway model id (`provider/model`)
 * @returns Upstream provider's thinking options, or undefined if unsupported
 */
function buildGatewayThinking(
  level: string,
  model: string,
): ProviderOptions | undefined {
  switch (model.split("/")[0]) {
    case "anthropic":
      return buildAnthropicThinking(level);
    case "google":
      return buildGeminiThinking(level);
    case "openai":
      return buildOpenAIThinking(level);
    default:
      return undefined;
  }
}

/**
 * Warn that a requested thinking level had no effect on a gateway model.
 *
 * @param level - Thinking level string
 * @param model - Gateway model id (`provider/model`)
 * @returns Always undefined (no provider options)
 */
function warnGatewayIgnored(level: string, model: string): undefined {
  if (level !== "off") {
    console.warn(
      `Warning: --thinking ${level} ignored — no thinking setting for ${model} on the Vercel gateway`,
    );
  }

  return undefined;
}

/**
 * Resolve a thinking level to a token budget
 *
 * @param level - Named level ("low", "medium", etc.) or numeric string ("4096")
 * @param map - Budget map for the provider
 * @returns Token budget, or undefined if unrecognized
 */
function resolveBudget(
  level: string,
  map: Record<string, number>,
): number | undefined {
  if (level in map) {
    return map[level];
  }

  // Support numeric strings (e.g., "4096")
  const parsed = Number.parseInt(level, 10);

  return Number.isNaN(parsed) ? undefined : parsed;
}
