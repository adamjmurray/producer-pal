// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type SemanticEagerness,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/turn-detection-helpers";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

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
 * Haiku 4.5 does not support adaptive thinking yet.
 * @param {string} model - Model identifier
 * @returns {boolean} - True if model needs legacy thinking config
 */
export function isLegacyThinkingModel(model: string): boolean {
  return model.includes("haiku");
}

/**
 * Checks if an Anthropic model has always-on thinking that cannot be disabled.
 * Fable 5 / Mythos 5 run thinking unconditionally and reject
 * `thinking: {type: "disabled"}` with a 400 — thinking must be omitted for
 * these, so "Off" cannot fully turn thinking off.
 * @param {string} model - Model identifier
 * @returns {boolean} - True if the model's thinking cannot be disabled
 */
export function isAlwaysOnThinkingModel(model: string): boolean {
  return model.includes("fable") || model.includes("mythos");
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
 * Maps thinking UI setting to reasoning effort for OpenRouter.
 * Simple direct mapping without model-specific logic.
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
      return undefined;
    default:
      return "medium";
  }
}

/**
 * Extracts the GPT version number from a model name.
 * @param {string} model - Model identifier (e.g., "gpt-5.2-2025-12-11")
 * @returns {number | null} - Version number (e.g., 5.2) or null if not a GPT model with decimal version
 */
export function extractGptVersion(model: string): number | null {
  // Match gpt-X.Y where X.Y is a decimal version (e.g., gpt-5.1, gpt-5.2)
  const match = model.match(/^gpt-(\d+\.\d+)/);

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
 * Checks if an OpenAI model is a reasoning model that doesn't support temperature.
 * Covers GPT-5 family (gpt-5, gpt-5.4-mini, gpt-5.2, gpt-5.3-codex, etc.) and o-series.
 * @param {string} model - Model identifier
 * @returns {boolean} - True if reasoning model
 */
export function isOpenAIReasoningModel(model: string): boolean {
  return model.startsWith("gpt-5") || isO1O3Model(model);
}

/**
 * Checks if a model supports xhigh reasoning effort.
 * @param {string} model - Model identifier
 * @returns {boolean} - True if xhigh is supported
 */
function supportsXHigh(model: string): boolean {
  const version = extractGptVersion(model);

  // gpt-5.2+ supports xhigh
  if (version !== null && version >= 5.2) return true;

  // Special case: gpt-5.1-codex-max supports xhigh
  if (model.startsWith("gpt-5.1-codex-max")) return true;

  return false;
}

/**
 * Maps thinking UI setting to OpenAI reasoning_effort parameter based on model.
 * - o1/o3: low, medium, high
 * - gpt-5.1+: low, medium, high (xhigh for 5.2+ or codex-max)
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

/**
 * Maps a thinking UI value to Ollama's think parameter.
 * GPT-OSS models expect "low"/"medium"/"high" level strings for trace length.
 * Other models accept boolean true/false.
 * @param {string} thinking - Thinking mode setting from UI
 * @param {string} model - Model name for GPT-OSS detection
 * @returns {boolean | string | undefined} - true/level = enable, undefined = adaptive/default
 */
export function mapThinkingToOllamaThink(
  thinking: string,
  model: string,
): boolean | string | undefined {
  const gptOss = model.includes("gpt-oss");

  switch (thinking) {
    case "Off":
      return false;
    case "Max":
      return gptOss ? "high" : true;
    default:
      return undefined; // Default - let API decide
  }
}
