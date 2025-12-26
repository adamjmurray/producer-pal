import {
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
  type ReasoningEffort,
} from "#webui/hooks/settings/config-builders";
import { isOpenRouterProvider } from "#webui/utils/provider-detection";

/**
 * Per-message overrides for thinking and temperature settings
 */
export interface OpenAIMessageOverrides {
  thinking?: string;
  temperature?: number;
}

/**
 * Effective settings for API calls
 */
export interface EffectiveSettings {
  temperature: number | undefined;
  reasoningEffort: ReasoningEffort | undefined;
  excludeReasoning: boolean | undefined;
}

/**
 * Calculates effective settings from overrides and config
 * @param {OpenAIMessageOverrides} [overrides] - Per-message overrides
 * @param {object} config - Client configuration
 * @param {number} [config.temperature] - Default temperature
 * @param {ReasoningEffort} [config.reasoningEffort] - Default reasoning effort
 * @param {boolean} [config.excludeReasoning] - Default exclude setting
 * @param {string} [config.baseUrl] - Base URL for provider detection
 * @param {string} config.model - Model identifier
 * @returns {EffectiveSettings} - Effective temperature and reasoning effort
 */
export function calculateEffectiveSettings(
  overrides: OpenAIMessageOverrides | undefined,
  config: {
    temperature?: number;
    reasoningEffort?: ReasoningEffort;
    excludeReasoning?: boolean;
    baseUrl?: string;
    model: string;
  },
): EffectiveSettings {
  // If no overrides, use config values
  if (!overrides) {
    return {
      temperature: config.temperature,
      reasoningEffort: config.reasoningEffort,
      excludeReasoning: config.excludeReasoning,
    };
  }

  // Calculate effective temperature
  const temperature = overrides.temperature ?? config.temperature;

  // Calculate effective reasoning effort if thinking override provided
  let reasoningEffort: ReasoningEffort | undefined = config.reasoningEffort;
  let excludeReasoning = config.excludeReasoning;

  if (overrides.thinking !== undefined) {
    if (isOpenRouterProvider(config.baseUrl)) {
      reasoningEffort = mapThinkingToOpenRouterEffort(overrides.thinking);
      // Exclude reasoning when effort is "none"
      excludeReasoning = reasoningEffort === "none";
    } else {
      reasoningEffort = mapThinkingToReasoningEffort(
        overrides.thinking,
        config.model,
      );
    }
  }

  return { temperature, reasoningEffort, excludeReasoning };
}
