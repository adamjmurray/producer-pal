import type { GeminiClientConfig } from "#webui/chat/gemini-client";
import type { OpenAIClientConfig } from "#webui/chat/openai-client";
import { getThinkingBudget, SYSTEM_INSTRUCTION } from "#webui/lib/config";
import type { GeminiMessage, OpenAIMessage } from "#webui/types/messages";

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
 * @returns {any} - Hook return value
 */
function isOpenAIProvider(baseUrl?: string): boolean {
  // If no baseUrl, OpenAIClient defaults to OpenAI
  if (!baseUrl) return true;
  // Check if it's the OpenAI API URL
  return baseUrl === "https://api.openai.com/v1";
}

/**
 * Maps Gemini thinking setting to OpenAI reasoning_effort parameter.
 * Note: Most OpenAI models don't support reasoning_effort (only o1/o3 series).
 * @param {string} thinking - Thinking mode setting
 * @returns {any} - Hook return value
 */
function mapThinkingToReasoningEffort(
  thinking: string,
): "low" | "medium" | "high" | undefined {
  switch (thinking) {
    case "Low":
      return "low";
    case "High":
    case "Ultra":
      return "high";
    case "Auto":
    case "Medium":
      return "medium";
    default:
      // "Off" or specific budgets - OpenAI doesn't support granular control
      return undefined;
  }
}

/**
 * Builds OpenAI client configuration from settings
 * @param {string} model - Model identifier
 * @param {number} temperature - Temperature value (0-2)
 * @param {string} thinking - Thinking mode setting
 * @param {string} [baseUrl] - Base URL for custom provider
 * @param {Record<string, boolean>} enabledTools - Tool enabled states
 * @param {OpenAIMessage[]} [chatHistory] - Optional chat history
 * @returns {any} - Hook return value
 */
export function buildOpenAIConfig(
  model: string,
  temperature: number,
  thinking: string,
  baseUrl: string | undefined,
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

  // Only include reasoning_effort when using actual OpenAI API (not Groq/Mistral/etc)
  if (isOpenAIProvider(baseUrl)) {
    const reasoningEffort = mapThinkingToReasoningEffort(thinking);
    if (reasoningEffort) {
      config.reasoningEffort = reasoningEffort;
    }
  }

  return config;
}
