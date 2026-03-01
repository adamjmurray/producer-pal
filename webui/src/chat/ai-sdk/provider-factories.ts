// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { type LanguageModel } from "ai";
import { type Provider } from "#webui/types/settings";

/**
 * Creates an AI SDK LanguageModel instance for the given provider.
 * All OpenAI-compatible providers use @ai-sdk/openai with different base URLs.
 *
 * @param provider - Producer Pal provider identifier
 * @param modelId - Model identifier string
 * @param apiKey - API key for the provider
 * @param baseUrl - Optional base URL override (for local/custom providers)
 * @returns AI SDK LanguageModel instance
 */
export function createProviderModel(
  provider: Provider,
  modelId: string,
  apiKey: string,
  baseUrl?: string,
): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(`${modelId}`);

    case "openrouter":
      return createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      })(`${modelId}`);

    case "mistral":
      return createOpenAI({
        apiKey,
        baseURL: "https://api.mistral.ai/v1",
      })(`${modelId}`);

    case "lmstudio":
      return createOpenAI({
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl ?? "http://localhost:1234/v1",
      })(`${modelId}`);

    case "ollama":
      return createOpenAI({
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl ?? "http://localhost:11434/v1",
      })(`${modelId}`);

    case "custom":
      return createOpenAI({
        apiKey,
        baseURL: baseUrl,
      })(`${modelId}`);

    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(`${modelId}`);

    default: {
      // Exhaustive check — all providers should be handled
      const _exhaustive: never = provider;

      return _exhaustive;
    }
  }
}
