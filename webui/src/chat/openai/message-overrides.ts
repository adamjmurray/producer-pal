// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
  type ReasoningEffort,
} from "#webui/hooks/settings/config-builders";
import { isOpenRouterProvider } from "#webui/utils/provider-detection";

/**
 * Per-message overrides for thinking, temperature, and showThoughts settings
 */
export interface OpenAIMessageOverrides {
  thinking?: string;
  temperature?: number;
  showThoughts?: boolean;
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

  // Apply showThoughts override (only affects OpenRouter's excludeReasoning)
  if (
    overrides.showThoughts !== undefined &&
    isOpenRouterProvider(config.baseUrl)
  ) {
    excludeReasoning = !overrides.showThoughts;
  }

  return { temperature, reasoningEffort, excludeReasoning };
}
