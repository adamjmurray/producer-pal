/**
 * Centralized provider configuration for all LLM providers
 *
 * This module provides a single source of truth for provider settings
 * used across chat and eval code.
 */

import OpenAI from "openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Provider configuration interface */
export interface ProviderConfig {
  apiKeyEnvVar: string;
  providerName: string;
  defaultModel: string;
}

/** Extended config for OpenAI-compatible providers */
export interface OpenAIProviderConfig extends ProviderConfig {
  createClient: (apiKey: string) => OpenAI;
}

/** Anthropic provider configuration */
export const ANTHROPIC_CONFIG: ProviderConfig = {
  apiKeyEnvVar: "ANTHROPIC_KEY",
  providerName: "Anthropic",
  defaultModel: "claude-sonnet-4-5-20250929",
};

/** Google Gemini provider configuration */
export const GEMINI_CONFIG: ProviderConfig = {
  apiKeyEnvVar: "GEMINI_KEY",
  providerName: "Gemini",
  defaultModel: "gemini-2.5-flash-lite",
};

/** OpenAI provider configuration */
export const OPENAI_CONFIG: OpenAIProviderConfig = {
  apiKeyEnvVar: "OPENAI_KEY",
  providerName: "OpenAI",
  defaultModel: "gpt-5-nano",
  createClient: (apiKey: string) => new OpenAI({ apiKey }),
};

/** OpenRouter provider configuration */
export const OPENROUTER_CONFIG: OpenAIProviderConfig = {
  apiKeyEnvVar: "OPENROUTER_KEY",
  providerName: "OpenRouter",
  defaultModel: "anthropic/claude-haiku-4.5",
  createClient: (apiKey: string) =>
    new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL }),
};

/**
 * Validate API key is present in environment
 *
 * @param config - Provider configuration
 * @returns The API key
 * @throws Error if API key is not set
 */
export function validateApiKey(config: ProviderConfig): string {
  const apiKey = process.env[config.apiKeyEnvVar];

  if (!apiKey) {
    throw new Error(`API key for ${config.providerName} is not set`);
  }

  return apiKey;
}
