// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Model-aware thinking settings for OpenAI, OpenRouter, Anthropic, Gemini and
 * Ollama. The chat UI and the evals CLI each map their own thinking setting
 * onto `ThinkingEffort` first. No imports of our own: the evals typecheck webui
 * files without webui's path aliases.
 */

import { type ProviderOptions } from "@ai-sdk/provider-utils";
import { getModelCapabilities } from "@ai-sdk/anthropic/internal";

/**
 * A thinking setting both clients can express. "auto" is the UI default: no
 * effort is sent, so the provider's own reasoning default applies.
 */
export type ThinkingEffort = "off" | "auto" | "low" | "medium" | "high" | "max";

export type ReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

// GPT-6 ids that accept `reasoning_effort: "none"`. Every other GPT-6 model
// (6.1 Sol, Astra, ...) 400s on it; the AI SDK drops the field with a warning,
// so the model would reason at its default instead of staying off.
const GPT6_ACCEPTS_NONE = /^gpt-6-(sol|luna)(-\d{4}-\d{2}-\d{2})?$/;

/**
 * Extracts the GPT version number from a model name.
 * @param model - Model identifier (e.g., "gpt-5.2-2025-12-11", "gpt-6.1-sol")
 * @returns Version number (e.g., 5.2, 6) or null if not a versioned GPT model
 */
export function extractGptVersion(model: string): number | null {
  const match = model.match(/^gpt-(\d+(?:\.\d+)?)/);

  return match?.[1] ? Number.parseFloat(match[1]) : null;
}

/**
 * Checks if a model is an o1 or o3 reasoning model.
 * @param model - Model identifier
 * @returns True if o1 or o3 model
 */
export function isO1O3Model(model: string): boolean {
  return model.startsWith("o1") || model.startsWith("o3");
}

/**
 * Checks if an OpenAI model is a reasoning model (emits reasoning tokens and
 * rejects a non-default sampling temperature). Gates the reasoning-summary
 * request in the adapter.
 * Covers GPT-5 and later (gpt-5, gpt-5.4-mini, gpt-6.1-sol, etc.) and o-series.
 * @param model - Model identifier
 * @returns True if reasoning model
 */
export function isOpenAIReasoningModel(model: string): boolean {
  const version = extractGptVersion(model);

  return (version != null && version >= 5) || isO1O3Model(model);
}

/**
 * Checks if a model supports xhigh reasoning effort.
 * @param model - Model identifier
 * @returns True if xhigh is supported
 */
function supportsXHigh(model: string): boolean {
  const version = extractGptVersion(model);

  // gpt-5.2+ supports xhigh
  if (version !== null && version >= 5.2) {
    return true;
  }

  // Special case: gpt-5.1-codex-max supports xhigh
  return model.startsWith("gpt-5.1-codex-max");
}

/**
 * Maps a thinking setting to OpenAI reasoning_effort based on model. Auto
 * sends none, so the model reasons at its own default.
 * - o1/o3: low, medium, high
 * - gpt-5.1+: low, medium, high (xhigh for 5.2+ or codex-max)
 * - gpt-6+: none, low, medium, high, xhigh, max. Off must send an explicit
 *   effort: omitting it reasons at the default (medium).
 * - Other models: undefined (no reasoning_effort sent)
 * @param level - Thinking setting
 * @param model - Model identifier, without any gateway prefix
 * @returns reasoning_effort value or undefined
 */
export function mapThinkingToReasoningEffort(
  level: ThinkingEffort,
  model: string,
): ReasoningEffort | undefined {
  const gptVersion = extractGptVersion(model);
  const isO1O3 = isO1O3Model(model);

  // Only o1/o3 and gpt-5.1+ support reasoning_effort
  if (!isO1O3 && (gptVersion === null || gptVersion < 5.1)) {
    return undefined;
  }

  if (level === "off") {
    if (gptVersion == null || gptVersion < 6) {
      return undefined;
    }

    return GPT6_ACCEPTS_NONE.test(model) ? "none" : "low";
  }

  if (level === "max") {
    if (isO1O3) {
      return "high";
    }

    if (gptVersion != null && gptVersion >= 6) {
      return "max";
    }

    return supportsXHigh(model) ? "xhigh" : "high";
  }

  return level === "auto" ? undefined : level;
}

/**
 * Maps a thinking setting to reasoning effort for OpenRouter. Off is "none";
 * the chat UI's request rewrite raises it to "low" for models that can't turn
 * reasoning off, and drops it when the model is unknown. Auto has no effort.
 * @param level - Thinking setting
 * @returns reasoning effort value, or undefined for none
 */
export function mapThinkingToOpenRouterEffort(
  level: ThinkingEffort,
): ReasoningEffort | undefined {
  switch (level) {
    case "max":
      return "xhigh";
    case "off":
      return "none";
    case "auto":
      return undefined;
    default:
      return level;
  }
}

/**
 * Maps a thinking setting to Ollama's `reasoning_effort`. Ollama's OpenAI
 * endpoint ignores `think`; `none` turns reasoning off. Max sends nothing:
 * models that can't think refuse any other effort with a 400.
 * @param level - Thinking setting
 * @returns effort, or undefined to let the model decide
 */
export function mapThinkingToOllamaEffort(
  level: ThinkingEffort,
): ReasoningEffort | undefined {
  return level === "off" ? "none" : undefined;
}

/**
 * The `thinkingConfig` that turns Gemini thinking down for "Off", by model
 * version. Gemini 3+ can't fully switch off and some models refuse a zero
 * budget, so it gets its lowest level (3.8 Flash still thinks a little). Gemini
 * 2.5 takes a zero budget, except the Pro models, which can't disable thinking.
 * Unknown or older ids get nothing, as before.
 * @param model - Gemini model id (`gemini-3.8-flash`)
 * @returns thinkingConfig, or undefined to omit it
 */
export function getGeminiOffThinkingConfig(
  model: string,
): { thinkingLevel: "low" } | { thinkingBudget: 0 } | undefined {
  const match = model.match(/^gemini-(\d+)(?:\.(\d+))?/);

  if (!match?.[1]) {
    return undefined;
  }

  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);

  if (major >= 3) {
    return { thinkingLevel: "low" };
  }

  if (major === 2 && minor >= 5 && !model.includes("-pro")) {
    return { thinkingBudget: 0 };
  }

  return undefined;
}

export interface AnthropicOptionsRoute {
  /**
   * Send an explicit `thinking` type for Off. The chat UI's direct route
   * leaves it out and lets its request rewrite add it.
   */
  explicitOff: boolean;
  /**
   * Ask for summarized thinking on adaptive requests. The direct route adds
   * `display` on the wire instead; the AI SDK has no option for it.
   */
  summarized: boolean;
}

/**
 * Checks if a model requires legacy enabled thinking (budgetTokens) instead of adaptive.
 * Only Haiku 4.5: it lacks adaptive thinking, and Haiku 5.5+ rejects budgetTokens.
 * @param model - Model identifier
 * @returns True if model needs legacy thinking config
 */
export function isLegacyThinkingModel(model: string): boolean {
  return model.includes("haiku-4");
}

// Fable and Mythos stay listed by name so a newer id the SDK table doesn't know
// yet still omits `thinking` rather than 400ing.
const ALWAYS_ON_THINKING_MODEL = /fable|mythos/;

/**
 * Asks the AI SDK's own model table about an Anthropic id. Its ids use dashes
 * (`claude-opus-5-5`); the gateway spells them `claude-opus-5.5`.
 * @param model - Model identifier
 * @returns The SDK's capabilities
 */
function sdkCapabilities(
  model: string,
): ReturnType<typeof getModelCapabilities> {
  return getModelCapabilities(model.replaceAll(".", "-"));
}

/**
 * Checks if an Anthropic model has always-on thinking that cannot be disabled.
 * Opus 5.5, Fable and Mythos run thinking unconditionally and reject any
 * `thinking: {type: "disabled"}` with a 400 — `thinking` must be omitted for
 * these, so "Off" cannot fully turn thinking off. The SDK table is the source
 * for which models these are.
 * @param model - Model identifier
 * @returns True if the model's thinking cannot be disabled
 */
export function isAlwaysOnThinkingModel(model: string): boolean {
  const caps = sdkCapabilities(model);

  return (
    ALWAYS_ON_THINKING_MODEL.test(model) ||
    (caps.rejectsThinkingDisabled && !caps.supportsBetweenToolsThinking)
  );
}

// Claude 3.0/3.5 tiers (extended thinking arrived with 3.7), plus Claude 2.x /
// instant. The tier alternation excludes 3.7+ — "claude-3-7-sonnet" has no
// "-opus|sonnet|haiku" directly after "claude-3(-5)?".
const LEGACY_NON_THINKING_MODEL =
  /^claude-3([.-]5)?[.-](opus|sonnet|haiku)|^claude-(2|instant)/;

/**
 * Checks if an Anthropic model predates the `thinking` parameter entirely
 * (Claude 3.5 and earlier). These ids reject ANY `thinking` field — including
 * `{type: "disabled"}` — with a 400, so the forced-disabled injection must be
 * skipped for them. Only reachable via the free-text "Other..." model input, as
 * no preset lists a pre-3.7 id.
 * @param model - Model identifier
 * @returns True if the model has no `thinking` parameter support
 */
export function isLegacyNonThinkingModel(model: string): boolean {
  return LEGACY_NON_THINKING_MODEL.test(model);
}

/**
 * What "Off" must send as `thinking` for a model, since omitting it runs
 * adaptive thinking on Sonnet 5+. Sonnet 5.5 400s on `disabled` and takes
 * `between_tools` instead (its lowest setting); always-on, legacy and pre-3.7
 * models take no `thinking` field at all.
 * @param model - Model identifier
 * @returns The type, or undefined to omit
 */
export function getThinkingOffType(
  model: string,
): "disabled" | "between_tools" | undefined {
  if (
    isLegacyThinkingModel(model) ||
    isLegacyNonThinkingModel(model) ||
    isAlwaysOnThinkingModel(model)
  ) {
    return undefined;
  }

  return sdkCapabilities(model).supportsBetweenToolsThinking
    ? "between_tools"
    : "disabled";
}

/**
 * Build Anthropic provider options for a thinking setting. Uses adaptive
 * thinking, with an effort unless the setting is auto; falls back to legacy
 * enabled+budgetTokens for Haiku 4.5, which 400s on adaptive; and omits the
 * `thinking` field entirely for pre-3.7 models that don't support it.
 * @param level - Thinking setting
 * @param model - Anthropic model id, without any gateway prefix
 * @param route - How the request reaches Anthropic
 * @returns Anthropic provider options or undefined
 */
export function buildAnthropicProviderOptions(
  level: ThinkingEffort,
  model: string,
  route: AnthropicOptionsRoute,
): ProviderOptions | undefined {
  // Pre-3.7 models reject ANY `thinking` field with a 400, so never send one
  // regardless of the level.
  if (isLegacyNonThinkingModel(model)) {
    return undefined;
  }

  if (isLegacyThinkingModel(model)) {
    return buildLegacyThinking(level);
  }

  if (level === "off") {
    return buildOffOptions(model, route.explicitOff);
  }

  return {
    anthropic: {
      thinking: {
        type: "adaptive",
        ...(route.summarized ? { display: "summarized" } : {}),
      },
      ...(level === "auto" ? {} : { effort: level }),
    },
  };
}

/**
 * Haiku 4.5 takes a token budget, not an effort.
 * @param level - Thinking setting
 * @returns Anthropic provider options or undefined
 */
function buildLegacyThinking(
  level: ThinkingEffort,
): ProviderOptions | undefined {
  if (level === "off") {
    return undefined;
  }

  return {
    anthropic: {
      thinking: {
        type: "enabled",
        budgetTokens: level === "max" ? 16384 : 10240,
      },
    },
  };
}

/**
 * Off for an adaptive model. Always-on models can't turn thinking off (and 400
 * on a `thinking` field), so they ask for the least of it instead.
 * @param model - Anthropic model id
 * @param explicitOff - Send the model's off type rather than omit `thinking`
 * @returns Anthropic provider options or undefined
 */
function buildOffOptions(
  model: string,
  explicitOff: boolean,
): ProviderOptions | undefined {
  if (isAlwaysOnThinkingModel(model)) {
    return { anthropic: { effort: "low" } };
  }

  const type = explicitOff ? getThinkingOffType(model) : undefined;

  return type == null ? undefined : { anthropic: { thinking: { type } } };
}
