// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** Placeholder API key for local providers that don't require authentication */
export const LOCAL_PROVIDER_API_KEY = "not-needed";

/**
 * Resolve the API key to send for a provider, substituting the placeholder key
 * for providers that may not need authentication: local ones (lmstudio/ollama)
 * and a custom endpoint once it has a URL. This is the one place that decides
 * which providers can go without a key.
 * @param provider - Provider identifier
 * @param apiKey - The stored API key (may be empty for keyless providers)
 * @param baseUrl - The provider's base URL (decides the custom provider)
 * @returns The API key to use for requests; "" when the provider needs one
 */
export function resolveProviderApiKey(
  provider: string,
  apiKey: string,
  baseUrl?: string,
): string {
  const keyless =
    provider === "lmstudio" ||
    provider === "ollama" ||
    (provider === "custom" && Boolean(baseUrl?.trim()));

  return keyless ? apiKey || LOCAL_PROVIDER_API_KEY : apiKey;
}

/**
 * Whether a provider has what it needs to chat: an API key, or none needed.
 * @param provider - Provider identifier
 * @param apiKey - The decrypted API key
 * @param baseUrl - The provider's base URL
 * @returns True when requests can be sent
 */
export function isProviderReady(
  provider: string,
  apiKey: string,
  baseUrl?: string,
): boolean {
  return resolveProviderApiKey(provider, apiKey, baseUrl) !== "";
}

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
 * Use the default when a URL setting is unset, empty, or only whitespace.
 * @param url - The configured URL, if any
 * @param fallback - Default URL
 * @returns The trimmed URL, or the default when it is blank
 */
export function withDefaultUrl(
  url: string | undefined,
  fallback: string,
): string {
  const trimmed = url?.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed;
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
  if (provider === "custom") {
    return baseUrl;
  }

  if (provider === "gemini") {
    return undefined;
  }

  if (provider === "lmstudio") {
    return normalizeLocalProviderUrl(
      withDefaultUrl(baseUrl, "http://localhost:1234"),
    );
  }

  if (provider === "ollama") {
    return normalizeLocalProviderUrl(
      withDefaultUrl(baseUrl, "http://localhost:11434"),
    );
  }

  return PROVIDER_BASE_URLS[provider as keyof typeof PROVIDER_BASE_URLS];
}
