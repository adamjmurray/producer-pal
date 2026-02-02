/**
 * Centralized thinking/reasoning level token budget mappings for different providers
 */

/** Maps thinking level strings to token budgets for Gemini */
export const GEMINI_THINKING_MAP: Record<string, number> = {
  off: 0,
  low: 2048,
  medium: 4096,
  high: 8192,
  ultra: 16384,
  auto: -1,
};

/** Maps thinking level strings to token budgets for Anthropic extended thinking */
export const ANTHROPIC_THINKING_MAP: Record<string, number> = {
  off: 0,
  low: 1024,
  medium: 4096,
  high: 10000,
  ultra: 32000,
  auto: -1,
};
