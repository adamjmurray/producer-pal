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
  switch (provider) {
    case "anthropic":
      return "Anthropic";
    case "gemini":
      return style === "product" ? "Gemini" : "Google";
    case "openai":
      return "OpenAI";
    case "mistral":
      return "Mistral";
    case "openrouter":
      return "OpenRouter";
    case "lmstudio":
      return "LM Studio";
    case "ollama":
      return "Ollama";
    case "custom":
      return "Custom";
  }
}
