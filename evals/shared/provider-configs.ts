// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Centralized provider configuration for all LLM providers
 *
 * This module provides a single source of truth for provider settings
 * used across chat and eval code.
 */

import { type EvalProvider } from "#evals/scenarios/types.ts";

/** Provider configuration interface */
export interface ProviderConfig {
  apiKeyEnvVar: string;
  providerName: string;
  defaultModel: string;
  /** If true, missing API key returns a fallback instead of throwing */
  apiKeyOptional?: boolean;
}

/** Anthropic provider configuration */
export const ANTHROPIC_CONFIG: ProviderConfig = {
  apiKeyEnvVar: "ANTHROPIC_KEY",
  providerName: "Anthropic",
  defaultModel: "claude-sonnet-4-5-20250929",
};

/** Codex CLI subscription provider configuration */
export const CODEX_CODE_CONFIG: ProviderConfig = {
  apiKeyEnvVar: "",
  providerName: "Codex CLI",
  defaultModel: "terra",
  apiKeyOptional: true,
};

/** Google Gemini provider configuration */
export const GEMINI_CONFIG: ProviderConfig = {
  apiKeyEnvVar: "GEMINI_KEY",
  providerName: "Gemini",
  defaultModel: "gemini-3.6-flash",
};

/** OpenAI provider configuration */
export const OPENAI_CONFIG: ProviderConfig = {
  apiKeyEnvVar: "OPENAI_KEY",
  providerName: "OpenAI",
  defaultModel: "gpt-5-nano",
};

/** OpenRouter provider configuration */
export const OPENROUTER_CONFIG: ProviderConfig = {
  apiKeyEnvVar: "OPENROUTER_KEY",
  providerName: "OpenRouter",
  defaultModel: "anthropic/claude-haiku-4.5",
};

/** Local OpenAI-compatible server configuration (Ollama, LM Studio, etc.) */
export const LOCAL_CONFIG: ProviderConfig = {
  apiKeyEnvVar: "LOCAL_API_KEY",
  providerName: "Local",
  defaultModel: "",
  apiKeyOptional: true,
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

/** All provider configs keyed by provider id (registry order) */
export const PROVIDER_CONFIGS: Record<EvalProvider, ProviderConfig> = {
  anthropic: ANTHROPIC_CONFIG,
  "codex-code": CODEX_CODE_CONFIG,
  google: GEMINI_CONFIG,
  local: LOCAL_CONFIG,
  openai: OPENAI_CONFIG,
  openrouter: OPENROUTER_CONFIG,
};

/** All valid provider ids (registry order) */
export const PROVIDERS: EvalProvider[] = Object.keys(
  PROVIDER_CONFIGS,
) as EvalProvider[];
