// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

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
    case "Off":
      return "none";
    case "Minimal":
      return "minimal";
    case "Low":
      return "low";
    case "Medium":
      return "medium";
    case "High":
      return "high";
    case "Ultra":
      return "xhigh";
    default:
      return undefined; // Default - let API use its default
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
function isO1O3Model(model: string): boolean {
  return model.startsWith("o1") || model.startsWith("o3");
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
 * - o1/o3: low, medium, high (Minimal→low, Ultra→high)
 * - gpt-5.1: none, minimal, low, medium, high (Ultra→high, except codex-max)
 * - gpt-5.2+: none, minimal, low, medium, high, xhigh
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
    // o1/o3: only supports low, medium, high (no "none" option)
    switch (thinking) {
      case "Off":
      case "Minimal":
        return "low"; // o1/o3 minimum is low
      case "Low":
        return "low";
      case "Medium":
        return "medium";
      case "High":
      case "Ultra":
        return "high";
      default:
        return undefined; // Default - let API use its default
    }
  }

  // gpt-5.1+: supports none, minimal, low, medium, high, (xhigh for 5.2+ or codex-max)
  switch (thinking) {
    case "Off":
      return "none";
    case "Minimal":
      return "minimal";
    case "Low":
      return "low";
    case "Medium":
      return "medium";
    case "High":
      return "high";
    case "Ultra":
      return supportsXHigh(model) ? "xhigh" : "high";
    default:
      return undefined; // Default - let API use its default
  }
}

/**
 * Maps a thinking UI value to Ollama's think parameter.
 * GPT-OSS models expect "low"/"medium"/"high" level strings for trace length.
 * Other models accept boolean true/false.
 * @param {string} thinking - Thinking mode setting from UI
 * @param {string} model - Model name for GPT-OSS detection
 * @returns {boolean | string | undefined} - false = disable, true/level = enable, undefined = default
 */
export function mapThinkingToOllamaThink(
  thinking: string,
  model: string,
): boolean | string | undefined {
  if (thinking === "Off") return false;
  if (thinking === "Default") return undefined;

  const gptOss = model.includes("gpt-oss");

  switch (thinking) {
    case "Minimal":
    case "Low":
      return gptOss ? "low" : true;
    case "Medium":
      return gptOss ? "medium" : true;
    case "High":
    case "Ultra":
      return gptOss ? "high" : true;
    default:
      return undefined;
  }
}
