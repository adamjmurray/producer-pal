// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * AI SDK provider factory for evals.
 * Creates LanguageModel instances from EvalProvider + model string.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel } from "ai";
import { type EvalProvider } from "#evals/scenarios/types.ts";
import {
  ANTHROPIC_CONFIG,
  GEMINI_CONFIG,
  LOCAL_CONFIG,
  OPENAI_CONFIG,
  OPENROUTER_CONFIG,
  validateApiKey,
} from "#evals/shared/provider-configs.ts";

const LOCAL_DEFAULT_BASE_URL = "http://localhost:11434/v1";

/**
 * Create an AI SDK LanguageModel for the given provider and model
 *
 * @param provider - The LLM provider
 * @param model - Model identifier string
 * @returns AI SDK LanguageModel instance
 */
export function createProviderModel(
  provider: EvalProvider,
  model: string,
): LanguageModel {
  switch (provider) {
    case "anthropic": {
      const apiKey = validateApiKey(ANTHROPIC_CONFIG);

      return createAnthropic({ apiKey })(model);
    }

    case "google": {
      const apiKey = validateApiKey(GEMINI_CONFIG);

      return createGoogleGenerativeAI({ apiKey })(model);
    }

    case "openai": {
      const apiKey = validateApiKey(OPENAI_CONFIG);

      return createOpenAI({ apiKey })(model);
    }

    case "openrouter": {
      const apiKey = validateApiKey(OPENROUTER_CONFIG);

      return createOpenRouter({ apiKey }).chat(model);
    }

    case "local": {
      const apiKey = validateApiKey(LOCAL_CONFIG);
      const baseURL = process.env.LOCAL_BASE_URL ?? LOCAL_DEFAULT_BASE_URL;

      return createOpenAI({ apiKey, baseURL }).chat(model);
    }

    default: {
      const _exhaustiveCheck: never = provider;

      throw new Error(`Unknown provider: ${String(_exhaustiveCheck)}`);
    }
  }
}
