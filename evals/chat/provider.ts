// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * AI SDK provider factory for evals.
 * Creates LanguageModel instances from EvalProvider + model string.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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

      // Use @ai-sdk/openai-compatible (not @ai-sdk/openai): its chatModel
      // surfaces the `reasoning_content` field that LM Studio / Ollama reasoning
      // models emit as thinking deltas, whereas @ai-sdk/openai's chat model
      // silently drops it (matching the webui's lmstudio provider). includeUsage
      // makes the OpenAI-compatible server emit a usage chunk for token counts.
      return createOpenAICompatible({
        name: "local",
        apiKey,
        baseURL,
        includeUsage: true,
      }).chatModel(model);
    }

    case "claude-code":
    case "codex-code":
      throw new Error(
        `${provider} uses a spawned agent CLI transport, not the AI SDK provider.`,
      );

    default: {
      const _exhaustiveCheck: never = provider;

      throw new Error(`Unknown provider: ${String(_exhaustiveCheck)}`);
    }
  }
}
