// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: MIT

/**
 * Maps CLI --thinking levels to AI SDK providerOptions per provider.
 */

import { getModelCapabilities } from "@ai-sdk/anthropic/internal";
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

/** OpenAI reasoning effort levels (off and ultra depend on the model) */
const OPENAI_EFFORT_MAP: Record<string, string> = {
  low: "low",
  medium: "medium",
  high: "high",
};

// GPT-6 ids that take effort "none"; the others 400. Same as webui (parity test).
const GPT6_ACCEPTS_NONE = /^gpt-6-(sol|luna)(-\d{4}-\d{2}-\d{2})?$/;

// Always-on Claude models; same rule as webui (parity test).
const ALWAYS_ON_THINKING_MODEL = /fable|mythos/;

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
      return buildAnthropicThinking(level, model);
    case "google":
      return buildGeminiThinking(level);
    case "openai":
      return buildOpenAIThinking(level, model);
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
 * Off sends an explicit disable: omitting `thinking` still thinks on
 * adaptive-by-default models (Sonnet 5+). Always-on models reject it, so they
 * get effort low.
 *
 * @param level - Thinking level string
 * @param model - Anthropic model id (with or without a `provider/` prefix)
 * @returns Provider options with anthropic thinking and effort config
 */
function buildAnthropicThinking(
  level: string,
  model: string,
): ProviderOptions | undefined {
  const effort = ANTHROPIC_EFFORT_MAP[level];

  if (!effort) {
    return undefined;
  }

  if (effort === "none") {
    return isAlwaysOnThinking(model)
      ? { anthropic: { effort: "low" } }
      : { anthropic: { thinking: { type: "disabled" } } };
  }

  return {
    anthropic: {
      thinking: { type: "adaptive" },
      effort,
    },
  };
}

/**
 * @param model - Anthropic model id (with or without a `provider/` prefix)
 * @returns True when the model's thinking can't be turned off
 */
function isAlwaysOnThinking(model: string): boolean {
  const caps = getModelCapabilities(model.replaceAll(".", "-"));

  return (
    ALWAYS_ON_THINKING_MODEL.test(model) ||
    (caps.rejectsThinkingDisabled && !caps.supportsBetweenToolsThinking)
  );
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
 * Build OpenAI thinking provider options. GPT-6 reasons at medium when no
 * effort is sent, so off sends its lowest accepted effort; ultra sends max.
 *
 * @param level - Thinking level string
 * @param model - OpenAI model id (with or without a `provider/` prefix)
 * @returns Provider options with openai reasoningEffort
 */
function buildOpenAIThinking(
  level: string,
  model: string,
): ProviderOptions | undefined {
  const id = model.split("/").at(-1) as string;
  const isGpt6 = id.startsWith("gpt-6");
  let effort: string | undefined = OPENAI_EFFORT_MAP[level];

  if (level === "off" && isGpt6) {
    effort = GPT6_ACCEPTS_NONE.test(id) ? "none" : "low";
  } else if (level === "ultra" && isGpt6) {
    effort = "max";
  }

  return effort ? { openai: { reasoningEffort: effort } } : undefined;
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
      return buildAnthropicThinking(level, model);
    case "google":
      return buildGeminiThinking(level);
    case "openai":
      return buildOpenAIThinking(level, model);
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
