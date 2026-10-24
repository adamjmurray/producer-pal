// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { getModelCapabilities } from "@ai-sdk/anthropic/internal";
import {
  type SemanticEagerness,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/helpers/turn-detection-settings";

export type ReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type RealtimeReasoningEffort =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type AnthropicEffort = "low" | "medium" | "high" | "max";

/**
 * Maps thinking UI setting to OpenAI Realtime API reasoning.effort. The
 * Realtime API supports an additional "minimal" tier below "low" for the
 * Off case. Default returns undefined so the server picks its own default.
 * @param thinking - Thinking mode setting from UI
 * @returns A reasoning effort tier, or undefined to omit the field
 */
export function mapThinkingToRealtimeEffort(
  thinking: string,
): RealtimeReasoningEffort | undefined {
  switch (thinking) {
    case "Off":
      return "minimal";
    case "Max":
      return "high";
    default:
      return undefined;
  }
}

/** OpenAI Realtime `audio.input.turnDetection` payload (snake_case "as-is"
 * shape). Only the fields each mode uses are sent. Structurally validated at
 * the assignment site against the SDK's RealtimeTurnDetectionConfig. */
export interface RealtimeTurnDetectionPayload {
  type: "server_vad" | "semantic_vad";
  threshold?: number;
  silence_duration_ms?: number;
  eagerness?: SemanticEagerness;
  interrupt_response: boolean;
}

/**
 * Maps the UI turn-detection settings to the OpenAI Realtime
 * audio.input.turnDetection payload. server_vad carries the volume threshold
 * and silence window; semantic_vad carries the eagerness tier. Each mode omits
 * the other mode's fields. interrupt_response (barge-in) applies to both.
 * @param settings - UI turn-detection settings
 * @returns The turn-detection payload for the realtime session config
 */
export function mapTurnDetectionToConfig(
  settings: TurnDetectionSettings,
): RealtimeTurnDetectionPayload {
  if (settings.mode === "semantic_vad") {
    return {
      type: "semantic_vad",
      eagerness: settings.eagerness,
      interrupt_response: settings.interruptResponse,
    };
  }

  return {
    type: "server_vad",
    threshold: settings.threshold,
    silence_duration_ms: settings.silenceDurationMs,
    interrupt_response: settings.interruptResponse,
  };
}

/**
 * Checks if a model requires legacy enabled thinking (budgetTokens) instead of adaptive.
 * Only Haiku 4.5: it lacks adaptive thinking, and Haiku 5.5+ rejects budgetTokens.
 * @param {string} model - Model identifier
 * @returns {boolean} - True if model needs legacy thinking config
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
 * @param {string} model - Model identifier
 * @returns {ReturnType<typeof getModelCapabilities>} - The SDK's capabilities
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
 * @param {string} model - Model identifier
 * @returns {boolean} - True if the model's thinking cannot be disabled
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
 * @param {string} model - Model identifier
 * @returns {boolean} - True if the model has no `thinking` parameter support
 */
export function isLegacyNonThinkingModel(model: string): boolean {
  return LEGACY_NON_THINKING_MODEL.test(model);
}

/**
 * What "Off" must send as `thinking` for a model, since omitting it runs
 * adaptive thinking on Sonnet 5+. Sonnet 5.5 400s on `disabled` and takes
 * `between_tools` instead (its lowest setting); always-on, legacy and pre-3.7
 * models take no `thinking` field at all.
 * @param {string} model - Model identifier
 * @returns {"disabled" | "between_tools" | undefined} - The type, or undefined to omit
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
 * Maps thinking UI setting to Anthropic effort level for adaptive thinking.
 * @param {string} thinking - Thinking mode setting from UI
 * @returns {AnthropicEffort | undefined} - effort level or undefined for Off
 */
export function mapThinkingToAnthropicEffort(
  thinking: string,
): AnthropicEffort | undefined {
  switch (thinking) {
    case "Max":
      return "max";
    case "Off":
      return undefined;
    default:
      return "high";
  }
}

/**
 * Maps thinking UI setting to reasoning effort for OpenRouter. Off is "none";
 * the request rewrite (openrouter-reasoning.ts) raises it to "low" for models
 * that can't turn reasoning off, and drops it when the model is unknown.
 * @param {string} thinking - Thinking mode setting from UI
 * @returns {ReasoningEffort | undefined} - reasoning effort value or undefined
 */
export function mapThinkingToOpenRouterEffort(
  thinking: string,
): ReasoningEffort | undefined {
  switch (thinking) {
    case "Max":
      return "xhigh";
    case "Off":
      return "none";
    default:
      return "medium";
  }
}

/**
 * Extracts the GPT version number from a model name.
 * @param {string} model - Model identifier (e.g., "gpt-5.2-2025-12-11", "gpt-6.1-sol")
 * @returns {number | null} - Version number (e.g., 5.2, 6) or null if not a versioned GPT model
 */
export function extractGptVersion(model: string): number | null {
  const match = model.match(/^gpt-(\d+(?:\.\d+)?)/);

  return match?.[1] ? Number.parseFloat(match[1]) : null;
}

/**
 * Checks if a model is an o1 or o3 reasoning model.
 * @param {string} model - Model identifier
 * @returns {boolean} - True if o1 or o3 model
 */
export function isO1O3Model(model: string): boolean {
  return model.startsWith("o1") || model.startsWith("o3");
}

/**
 * Checks if an OpenAI model is a reasoning model (emits reasoning tokens and
 * rejects a non-default sampling temperature). Gates the reasoning-summary
 * request in the adapter.
 * Covers GPT-5 and later (gpt-5, gpt-5.4-mini, gpt-6.1-sol, etc.) and o-series.
 * @param {string} model - Model identifier
 * @returns {boolean} - True if reasoning model
 */
export function isOpenAIReasoningModel(model: string): boolean {
  const version = extractGptVersion(model);

  return (version != null && version >= 5) || isO1O3Model(model);
}

/**
 * Checks if a model supports xhigh reasoning effort.
 * @param {string} model - Model identifier
 * @returns {boolean} - True if xhigh is supported
 */
function supportsXHigh(model: string): boolean {
  const version = extractGptVersion(model);

  // gpt-5.2+ supports xhigh
  if (version !== null && version >= 5.2) {
    return true;
  }

  // Special case: gpt-5.1-codex-max supports xhigh
  if (model.startsWith("gpt-5.1-codex-max")) {
    return true;
  }

  return false;
}

/**
 * Maps thinking UI setting to OpenAI reasoning_effort parameter based on model.
 * - o1/o3: low, medium, high
 * - gpt-5.1+: low, medium, high (xhigh for 5.2+ or codex-max)
 * - gpt-6+: none, low, medium, high, xhigh, max
 * - Other models: undefined (no reasoning_effort sent)
 * @param {string} thinking - Thinking mode setting from UI
 * @param {string} model - Model identifier
 * @returns {ReasoningEffort | undefined} - reasoning_effort value or undefined
 */
export function mapThinkingToReasoningEffort(
  thinking: string,
  model: string,
): ReasoningEffort | undefined {
  const gptVersion = extractGptVersion(model);
  const isO1O3 = isO1O3Model(model);

  // Only o1/o3 and gpt-5.1+ support reasoning_effort
  if (!isO1O3 && (gptVersion === null || gptVersion < 5.1)) {
    return undefined;
  }

  // Map thinking UI values to reasoning_effort
  if (isO1O3) {
    // o1/o3: only supports low, medium, high
    switch (thinking) {
      case "Max":
        return "high";
      case "Off":
        return undefined;
      default:
        return "medium";
    }
  }

  if (gptVersion != null && gptVersion >= 6) {
    return mapThinkingToGpt6Effort(thinking, model);
  }

  // gpt-5.1+: supports low, medium, high, (xhigh for 5.2+ or codex-max)
  switch (thinking) {
    case "Max":
      return supportsXHigh(model) ? "xhigh" : "high";
    case "Off":
      return undefined;
    default:
      return "medium";
  }
}

// GPT-6 ids that accept `reasoning_effort: "none"`. Every other GPT-6 model
// (6.1 Sol, Astra, ...) 400s on it; the AI SDK drops the field with a warning,
// so the model would reason at its default instead of staying off. The evals
// CLI keeps a copy (evals/chat/thinking-provider-options.ts); a parity test
// holds the two in step.
const GPT6_ACCEPTS_NONE = /^gpt-6-(sol|luna)(-\d{4}-\d{2}-\d{2})?$/;

/**
 * Maps a thinking UI value to a GPT-6 reasoning effort. Off must send an
 * explicit effort: omitting it reasons at the default (medium).
 * @param {string} thinking - Thinking mode setting from UI
 * @param {string} model - Model identifier
 * @returns {ReasoningEffort} - reasoning_effort value
 */
function mapThinkingToGpt6Effort(
  thinking: string,
  model: string,
): ReasoningEffort {
  switch (thinking) {
    case "Max":
      return "max";
    case "Off":
      return GPT6_ACCEPTS_NONE.test(model) ? "none" : "low";
    default:
      return "medium";
  }
}

/**
 * Maps a thinking UI value to Ollama's `reasoning_effort`. Ollama's OpenAI
 * endpoint ignores `think`; `none` turns reasoning off. Max sends nothing:
 * models that can't think refuse any other effort with a 400.
 * @param {string} thinking - Thinking mode setting from UI
 * @returns {ReasoningEffort | undefined} - effort, or undefined to let the model decide
 */
export function mapThinkingToOllamaEffort(
  thinking: string,
): ReasoningEffort | undefined {
  return thinking === "Off" ? "none" : undefined;
}

/**
 * The `thinkingConfig` that turns Gemini thinking down for "Off", by model
 * version. Gemini 3+ can't fully switch off and some models refuse a zero
 * budget, so it gets its lowest level (3.8 Flash still thinks a little). Gemini 2.5 takes a zero
 * budget, except the Pro models, which can't disable thinking. Unknown or
 * older ids get nothing, as before.
 * @param {string} model - Gemini model id (`gemini-3.8-flash`)
 * @returns {object | undefined} - thinkingConfig, or undefined to omit it
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
