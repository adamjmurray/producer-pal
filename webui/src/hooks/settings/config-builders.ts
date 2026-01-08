import type { GeminiClientConfig } from "#webui/chat/gemini-client";
import type { OpenAIClientConfig } from "#webui/chat/openai-client";
import { getThinkingBudget, SYSTEM_INSTRUCTION } from "#webui/lib/config";
import type { GeminiMessage, OpenAIMessage } from "#webui/types/messages";
import { isOpenRouterProvider } from "#webui/utils/provider-detection";

/**
 * Builds Gemini client configuration from settings
 * @param {string} model - Model identifier
 * @param {number} temperature - Temperature value (0-2)
 * @param {string} thinking - Thinking mode setting
 * @param {boolean} showThoughts - Whether to include thoughts in response
 * @param {Record<string, boolean>} enabledTools - Tool enabled states
 * @param {GeminiMessage[]} [chatHistory] - Optional chat history
 * @returns {any} - Hook return value
 */
export function buildGeminiConfig(
  model: string,
  temperature: number,
  thinking: string,
  showThoughts: boolean,
  enabledTools: Record<string, boolean>,
  chatHistory?: GeminiMessage[],
): GeminiClientConfig {
  const thinkingBudget = getThinkingBudget(thinking);
  const config: GeminiClientConfig = {
    model,
    temperature,
    systemInstruction: SYSTEM_INSTRUCTION,
    enabledTools,
  };

  if (chatHistory) {
    config.chatHistory = chatHistory;
  }

  // Only set thinkingConfig if thinking is not disabled (0)
  // For Auto mode (-1) or specific budgets (>0), include thoughts based on user setting
  if (thinkingBudget !== 0) {
    config.thinkingConfig = {
      thinkingBudget,
      includeThoughts: showThoughts,
    };
  }

  return config;
}

/**
 * Check if we're using the actual OpenAI API (not OpenAI-compatible providers like Groq/Mistral).
 * reasoning_effort is only supported by OpenAI's API.
 * @param {string} [baseUrl] - Base URL to check
 * @returns {boolean} - True if OpenAI API
 */
function isOpenAIProvider(baseUrl?: string): boolean {
  // If no baseUrl, OpenAIClient defaults to OpenAI
  if (!baseUrl) return true;

  // Check if it's the OpenAI API URL
  return baseUrl === "https://api.openai.com/v1";
}

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
 * Builds OpenAI client configuration from settings
 * @param {string} model - Model identifier
 * @param {number} temperature - Temperature value (0-2)
 * @param {string} thinking - Thinking mode setting
 * @param {string} [baseUrl] - Base URL for custom provider
 * @param {boolean} showThoughts - Whether to include reasoning in response
 * @param {Record<string, boolean>} enabledTools - Tool enabled states
 * @param {OpenAIMessage[]} [chatHistory] - Optional chat history
 * @returns {any} - Hook return value
 */
export function buildOpenAIConfig(
  model: string,
  temperature: number,
  thinking: string,
  baseUrl: string | undefined,
  showThoughts: boolean,
  enabledTools: Record<string, boolean>,
  chatHistory?: OpenAIMessage[],
): OpenAIClientConfig {
  const config: OpenAIClientConfig = {
    model,
    temperature,
    systemInstruction: SYSTEM_INSTRUCTION,
    baseUrl,
    enabledTools,
  };

  if (chatHistory) {
    config.chatHistory = chatHistory;
  }

  // Only include reasoning when using OpenAI API or OpenRouter (not Groq/Mistral/etc)
  if (isOpenRouterProvider(baseUrl)) {
    // OpenRouter: simple direct mapping, client formats as { reasoning: { effort } }
    const effort = mapThinkingToOpenRouterEffort(thinking);

    if (effort) {
      config.reasoningEffort = effort;
      // Exclude reasoning from response when checkbox is unchecked
      config.excludeReasoning = !showThoughts;
    }
  } else if (isOpenAIProvider(baseUrl)) {
    // OpenAI: model-specific mapping, client formats as { reasoning_effort }
    const effort = mapThinkingToReasoningEffort(thinking, model);

    if (effort) {
      config.reasoningEffort = effort;
    }
  }

  return config;
}
