// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Provider } from "#webui/types/settings";

/**
 * Gets display name for a provider.
 * Returns the company/brand name by default (e.g., "Google" for gemini).
 * With `style: "product"`, returns the product name (e.g., "Gemini").
 * @param provider - Provider identifier
 * @param style - "brand" (default) or "product" for product-specific name
 * @returns Display name string
 */
export function getProviderName(
  provider: Provider,
  style: "brand" | "product" = "brand",
): string {
  if (style === "product" && provider === "gemini") return "Gemini";

  return BRAND_NAMES[provider];
}

// A Record keyed by Provider, so a new provider is a compile error here.
const BRAND_NAMES: Record<Provider, string> = {
  anthropic: "Anthropic",
  gemini: "Google",
  openai: "OpenAI",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  lmstudio: "LM Studio",
  ollama: "Ollama",
  custom: "Custom",
};
