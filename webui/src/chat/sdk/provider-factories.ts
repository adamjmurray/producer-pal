// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel } from "ai";
import { type Provider } from "#webui/types/settings";

/**
 * Creates an AI SDK LanguageModel instance for the given provider.
 * OpenAI-compatible providers use @ai-sdk/openai, OpenRouter uses its own SDK,
 * and Gemini uses @ai-sdk/google.
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
    case "anthropic":
      return createAnthropic({
        apiKey,
        headers: { "anthropic-dangerous-direct-browser-access": "true" },
        fetch: injectThinkingDisplay,
      })(modelId);

    case "openai":
      return createOpenAI({ apiKey })(`${modelId}`);

    case "openrouter":
      return createOpenRouter({ apiKey }).chat(`${modelId}`);

    case "mistral":
      return createMistral({ apiKey })(`${modelId}`);

    case "lmstudio":
      return createOpenAI({
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl ?? "http://localhost:1234/v1",
      })(`${modelId}`);

    case "ollama":
      return createOpenAI({
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl ?? "http://localhost:11434/v1",
      }).chat(`${modelId}`);

    case "custom":
      return createOpenAI({
        apiKey,
        baseURL: baseUrl,
      }).chat(`${modelId}`);

    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(`${modelId}`);

    /* v8 ignore start -- exhaustive switch: all provider values handled above */
    default: {
      const _exhaustive: never = provider;

      return _exhaustive;
    }
    /* v8 ignore stop */
  }
}

/**
 * Custom fetch wrapper that injects `display: "summarized"` into Anthropic API
 * requests using adaptive thinking. Without this, Opus 4.7 defaults to
 * `display: "omitted"` which returns empty thinking text.
 *
 * Workaround until @ai-sdk/anthropic adds native `display` support.
 * Only modifies requests that already have `thinking.type === "adaptive"`.
 *
 * @param input - Fetch input (URL or Request)
 * @param init - Fetch init options
 * @returns Fetch response
 */
export async function injectThinkingDisplay(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body);

      if (body.thinking?.type === "adaptive" && !body.thinking.display) {
        body.thinking.display = "summarized";
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // Not JSON — pass through unchanged
    }
  }

  return await fetch(input, init);
}
