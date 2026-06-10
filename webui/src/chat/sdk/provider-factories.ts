// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel } from "ai";
import { type Provider } from "#webui/types/settings";

/**
 * Creates an AI SDK LanguageModel instance for the given provider.
 * LM Studio and custom OpenAI-compatible endpoints use @ai-sdk/openai-compatible
 * (which surfaces the `reasoning_content` field local reasoning models emit as
 * thinking; @ai-sdk/openai's chat model silently drops it). Ollama stays on
 * @ai-sdk/openai because its thinking control rides on the `openai`
 * providerOptions namespace. OpenRouter uses its own SDK; Gemini uses
 * @ai-sdk/google.
 *
 * @param provider - Producer Pal provider identifier
 * @param modelId - Model identifier string
 * @param apiKey - API key for the provider
 * @param baseUrl - Optional base URL override (for local/custom providers).
 *   Required for the `custom` provider, which has no default endpoint.
 * @returns AI SDK LanguageModel instance
 * @throws If the `custom` provider is used without a base URL
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
      return createOpenAICompatible({
        name: "lmstudio",
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl ?? "http://localhost:1234/v1",
        // Without includeUsage the SDK omits `stream_options.include_usage`, so
        // OpenAI-compatible servers never emit a usage chunk and token counts
        // stay undefined (show as 0 in the UI).
        includeUsage: true,
      }).chatModel(`${modelId}`);

    case "ollama":
      return createOpenAI({
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl ?? "http://localhost:11434/v1",
      }).chat(`${modelId}`);

    case "custom": {
      // Unlike lmstudio/ollama, the custom provider has no default endpoint and
      // its baseUrl setting defaults to "". An empty baseURL makes
      // @ai-sdk/openai-compatible fail with an opaque request error, so require
      // it up front with an actionable message.
      const customBaseUrl = baseUrl?.trim();

      if (!customBaseUrl) {
        throw new Error(
          "The custom provider requires a URL. Set the OpenAI-compatible API endpoint URL (e.g. https://api.example.com/v1) in the connection settings.",
        );
      }

      return createOpenAICompatible({
        name: "custom",
        apiKey,
        baseURL: customBaseUrl,
        // See lmstudio note: required for OpenAI-compatible servers to report
        // token usage in streaming responses.
        includeUsage: true,
      }).chatModel(`${modelId}`);
    }

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
