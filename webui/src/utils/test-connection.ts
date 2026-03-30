// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Provider } from "#webui/types/settings";
import { getBaseUrl } from "#webui/utils/provider-url";

export type TestConnectionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const CLOUD_PROVIDERS = new Set<Provider>([
  "anthropic",
  "gemini",
  "openai",
  "mistral",
  "openrouter",
]);

const TIMEOUT_MS = 10_000;

interface TestConfig {
  url: string;
  headers: Record<string, string>;
}

type ConfigBuilder = (apiKey: string, baseUrl?: string) => TestConfig;

const CONFIG_BUILDERS: Record<Provider, ConfigBuilder> = {
  anthropic: (apiKey) => ({
    url: "https://api.anthropic.com/v1/models",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
  }),

  gemini: (apiKey) => ({
    url: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    headers: {},
  }),

  openai: (apiKey) => ({
    url: "https://api.openai.com/v1/models",
    headers: { Authorization: `Bearer ${apiKey}` },
  }),

  mistral: (apiKey) => ({
    url: "https://api.mistral.ai/v1/models",
    headers: { Authorization: `Bearer ${apiKey}` },
  }),

  openrouter: (apiKey) => ({
    url: "https://openrouter.ai/api/v1/auth/key",
    headers: { Authorization: `Bearer ${apiKey}` },
  }),

  ollama: (_apiKey, baseUrl) => ({
    url: `${getBaseUrl("ollama", baseUrl)}/models`,
    headers: {},
  }),

  lmstudio: (_apiKey, baseUrl) => ({
    url: `${getBaseUrl("lmstudio", baseUrl)}/models`,
    headers: {},
  }),

  custom: (apiKey, baseUrl) => {
    const headers: Record<string, string> = {};

    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    return { url: `${getBaseUrl("custom", baseUrl)}/models`, headers };
  },
};

/**
 * Test connection to an AI provider by hitting a lightweight endpoint.
 * @param provider - Provider identifier
 * @param apiKey - API key for the provider
 * @param baseUrl - Base URL for custom/local providers
 * @returns Result with ok status and user-friendly message
 */
export async function testConnection(
  provider: Provider,
  apiKey: string,
  baseUrl?: string,
): Promise<TestConnectionResult> {
  if (CLOUD_PROVIDERS.has(provider) && !apiKey) {
    return { ok: false, message: "API key required" };
  }

  if (provider === "custom" && !baseUrl) {
    return { ok: false, message: "Base URL required" };
  }

  const config = CONFIG_BUILDERS[provider](apiKey, baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(controller.abort.bind(controller), TIMEOUT_MS);

  try {
    const response = await fetch(config.url, {
      headers: config.headers,
      signal: controller.signal,
    });

    if (response.ok) return { ok: true, message: "Connected" };

    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "Invalid API key" };
    }

    return {
      ok: false,
      message: `Error: ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, message: "Connection timed out" };
    }

    return { ok: false, message: "Cannot reach server" };
  } finally {
    clearTimeout(timeout);
  }
}
