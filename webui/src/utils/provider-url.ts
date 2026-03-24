// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Placeholder API key for local providers that don't require authentication */
export const LOCAL_PROVIDER_API_KEY = "not-needed";

/** Base URLs for each provider */
const PROVIDER_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

/**
 * Normalize URL for local providers by ensuring /v1 suffix
 * @param url - URL to normalize
 * @returns Normalized URL with /v1 suffix
 */
export function normalizeLocalProviderUrl(url: string): string {
  // Remove trailing slashes
  const trimmed = url.replace(/\/+$/, "");

  // Check if already ends with /v1
  if (trimmed.endsWith("/v1")) {
    return trimmed;
  }

  return `${trimmed}/v1`;
}

/**
 * Get API base URL for the current provider
 * @param provider - Provider identifier
 * @param baseUrl - Base URL for custom/local providers
 * @returns Base URL or undefined for Gemini
 */
export function getBaseUrl(
  provider: string,
  baseUrl: string | undefined,
): string | undefined {
  if (provider === "custom") return baseUrl;
  if (provider === "gemini") return undefined;

  if (provider === "lmstudio") {
    return normalizeLocalProviderUrl(baseUrl ?? "http://localhost:1234");
  }

  if (provider === "ollama") {
    return normalizeLocalProviderUrl(baseUrl ?? "http://localhost:11434");
  }

  return PROVIDER_BASE_URLS[provider as keyof typeof PROVIDER_BASE_URLS];
}
