import type { ThinkingConfig } from "@google/genai/web";
import { getThinkingBudget } from "#webui/lib/config";

/**
 * Per-message overrides for thinking and temperature settings
 */
export interface GeminiMessageOverrides {
  thinking?: string;
  temperature?: number;
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
      // Keep includeThoughts from original config
      const includeThoughts = config.thinkingConfig?.includeThoughts ?? true;

      thinkingConfig = {
        thinkingBudget,
        includeThoughts,
      };
    }
  }

  return { temperature, thinkingConfig };
}
