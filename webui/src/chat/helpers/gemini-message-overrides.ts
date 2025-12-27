import type { ThinkingConfig } from "@google/genai/web";
import { getThinkingBudget } from "#webui/lib/config";

/**
 * Per-message overrides for thinking, temperature, and showThoughts settings
 */
export interface GeminiMessageOverrides {
  thinking?: string;
  temperature?: number;
  showThoughts?: boolean;
}

/**
 * Config values needed for applying overrides
 */
interface OverrideConfig {
  temperature?: number;
  thinkingConfig?: ThinkingConfig;
}

/**
 * Applies per-message overrides to create updated config values
 * @param {GeminiMessageOverrides} overrides - Per-message overrides
 * @param {OverrideConfig} config - Current client config
 * @returns {object} - Updated temperature and thinkingConfig
 */
export function applyGeminiOverrides(
  overrides: GeminiMessageOverrides,
  config: OverrideConfig,
): {
  temperature: number | undefined;
  thinkingConfig: ThinkingConfig | undefined;
} {
  let temperature = config.temperature;
  let thinkingConfig = config.thinkingConfig;

  // Apply temperature override
  if (overrides.temperature !== undefined) {
    temperature = overrides.temperature;
  }

  // Apply thinking override
  if (overrides.thinking !== undefined) {
    const thinkingBudget = getThinkingBudget(overrides.thinking);

    if (thinkingBudget === 0) {
      // Thinking is off
      thinkingConfig = undefined;
    } else {
      // Use showThoughts override if provided, otherwise keep from original config
      const includeThoughts =
        overrides.showThoughts ??
        config.thinkingConfig?.includeThoughts ??
        true;

      thinkingConfig = {
        thinkingBudget,
        includeThoughts,
      };
    }
  } else if (overrides.showThoughts !== undefined && thinkingConfig) {
    // Only showThoughts was overridden (not thinking level)
    thinkingConfig = {
      ...thinkingConfig,
      includeThoughts: overrides.showThoughts,
    };
  }

  return { temperature, thinkingConfig };
}
