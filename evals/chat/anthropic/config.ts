export const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

// Maps thinking level strings to token budgets for extended thinking
export const ANTHROPIC_THINKING_MAP: Record<string, number> = {
  off: 0,
  low: 1024,
  medium: 4096,
  high: 10000,
  ultra: 32000,
  auto: -1,
};
