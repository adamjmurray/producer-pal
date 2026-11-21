// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type streamText } from "ai";
import { type ChatClientConfig } from "#webui/chat/sdk/types";

type ProviderOptions = Parameters<typeof streamText>[0]["providerOptions"];

/**
 * Add Mistral's `promptCacheKey` (it caches nothing without one) to the
 * providerOptions of a direct Mistral model, whose `provider` is "mistral.chat".
 * Gateway ids, OpenRouter, Vercel and custom endpoints get none, whatever model
 * they serve. Existing `mistral` options are kept.
 * @param providerOptions - The request's providerOptions, if any
 * @param model - The client's language model
 * @param cacheKey - Key shared by every request of one client
 * @returns providerOptions, with the key added for direct Mistral
 */
export function withMistralCacheKey(
  providerOptions: ProviderOptions,
  model: ChatClientConfig["model"],
  cacheKey: string,
): ProviderOptions {
  if (typeof model === "string" || !model.provider.startsWith("mistral.")) {
    return providerOptions;
  }

  return {
    ...providerOptions,
    mistral: { ...providerOptions?.mistral, promptCacheKey: cacheKey },
  };
}
