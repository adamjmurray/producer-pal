// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Centralized provider configuration for all LLM providers
 *
 * This module provides a single source of truth for provider settings
 * used across chat and eval code.
 */

import OpenAI from "openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const LOCAL_DEFAULT_BASE_URL = "http://localhost:11434/v1";

/** Provider configuration interface */
export interface ProviderConfig {
  apiKeyEnvVar: string;
  providerName: string;
  defaultModel: string;
  /** If true, missing API key returns a fallback instead of throwing */
  apiKeyOptional?: boolean;
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

/** Local OpenAI-compatible server configuration (Ollama, LM Studio, etc.) */
export const LOCAL_CONFIG: OpenAIProviderConfig = {
  apiKeyEnvVar: "LOCAL_API_KEY",
  providerName: "Local",
  defaultModel: "",
  apiKeyOptional: true,
  createClient: (apiKey: string) =>
    new OpenAI({
      apiKey,
      baseURL: process.env.LOCAL_BASE_URL ?? LOCAL_DEFAULT_BASE_URL,
    }),
};

/**
 * Validate API key is present in environment
 *
 * @param config - Provider configuration
 * @returns The API key, or "local" fallback when apiKeyOptional is true
 * @throws Error if API key is not set and not optional
 */
export function validateApiKey(config: ProviderConfig): string {
  const apiKey = process.env[config.apiKeyEnvVar];

  if (!apiKey) {
    if (config.apiKeyOptional) return "local";
    throw new Error(`API key for ${config.providerName} is not set`);
  }

  return apiKey;
}
