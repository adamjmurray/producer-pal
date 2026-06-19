// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Model pricing for estimating eval run cost.
 *
 * IMPORTANT: these are best-effort estimates (USD per 1M tokens) and WILL drift.
 * Treat them as a starting point. To use exact current prices without editing
 * this file, drop an `eval-pricing.json` in the repo root mapping a model
 * substring to `{ "inputPer1M": <n>, "outputPer1M": <n> }`; the analyzer merges
 * it over these defaults. Confirm prices at each provider (and openrouter.ai).
 *
 * Local models are treated as free ($0). Models with no match report unknown
 * cost (the analyzer shows tokens but a blank cost).
 */

import { type TokenUsage } from "#evals/chat/shared/types.ts";

/** Price for a model, in USD per 1M tokens. */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/** A pricing table keyed by a (lowercase) model-name substring. */
export type PricingTable = Record<string, ModelPricing>;

/**
 * Best-effort default prices (USD per 1M tokens), keyed by a lowercase
 * substring matched against the `provider/model` key. Longest match wins.
 * Verify/override before trusting absolute cost numbers.
 */
export const DEFAULT_PRICING: PricingTable = {
  // Anthropic
  "claude-opus": { inputPer1M: 15, outputPer1M: 75 },
  "claude-sonnet": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku": { inputPer1M: 1, outputPer1M: 5 },
  // OpenAI
  "gpt-5-nano": { inputPer1M: 0.05, outputPer1M: 0.4 },
  "gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 2 },
  "gpt-5": { inputPer1M: 1.25, outputPer1M: 10 },
  // Google
  "gemini-3-pro": { inputPer1M: 1.25, outputPer1M: 10 },
  "gemini-3-flash": { inputPer1M: 0.3, outputPer1M: 2.5 },
  "gemini-2.5-flash": { inputPer1M: 0.3, outputPer1M: 2.5 },
  // Open-weight (typical hosted prices; varies a lot by host)
  qwen3: { inputPer1M: 0.2, outputPer1M: 0.6 },
  deepseek: { inputPer1M: 0.3, outputPer1M: 1.2 },
  kimi: { inputPer1M: 0.5, outputPer1M: 2 },
  glm: { inputPer1M: 0.3, outputPer1M: 1.2 },
  llama: { inputPer1M: 0.2, outputPer1M: 0.6 },
  mistral: { inputPer1M: 0.3, outputPer1M: 0.9 },
};

const FREE: ModelPricing = { inputPer1M: 0, outputPer1M: 0 };

/**
 * Look up pricing for a model key (e.g. "anthropic/claude-sonnet-4-5").
 * Local models are free. Otherwise the longest matching substring key wins.
 *
 * @param modelKey - The `provider/model` key
 * @param overrides - Optional pricing overrides merged over the defaults
 * @returns Pricing, or null if no match is found
 */
export function lookupPricing(
  modelKey: string,
  overrides?: PricingTable,
): ModelPricing | null {
  const key = modelKey.toLowerCase();

  if (key.startsWith("local/")) return FREE;

  const table = { ...DEFAULT_PRICING, ...overrides };
  const matches = Object.keys(table)
    .filter((k) => key.includes(k.toLowerCase()))
    .sort((a, b) => b.length - a.length);

  const best = matches[0];

  return best == null ? null : (table[best] ?? null);
}

/**
 * Compute the USD cost of a run's token usage at the given price.
 *
 * @param usage - Token usage
 * @param pricing - Per-1M-token price
 * @returns Cost in USD
 */
export function computeCostUsd(
  usage: TokenUsage,
  pricing: ModelPricing,
): number {
  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPer1M +
    (usage.outputTokens / 1_000_000) * pricing.outputPer1M
  );
}
