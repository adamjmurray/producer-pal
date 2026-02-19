// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import OpenAI from "openai";

/**
 * Headers that cause CORS issues with non-OpenAI providers (e.g., Mistral, LM Studio).
 * Set to null to suppress them from outgoing requests.
 */
const SUPPRESSED_STAINLESS_HEADERS = {
  "X-Stainless-Lang": null,
  "X-Stainless-Package-Version": null,
  "X-Stainless-OS": null,
  "X-Stainless-Arch": null,
  "X-Stainless-Runtime": null,
  "X-Stainless-Runtime-Version": null,
  "X-Stainless-Retry-Count": null,
  "X-Stainless-Timeout": null,
};

/**
 * Creates an OpenAI client instance, suppressing x-stainless headers for non-OpenAI base URLs.
 * @param apiKey - API key for authentication
 * @param baseUrl - Optional base URL (undefined uses default OpenAI URL)
 * @returns Configured OpenAI client
 */
export function createOpenAIClient(apiKey: string, baseUrl?: string): OpenAI {
  const isNonOpenAI =
    baseUrl != null && baseUrl !== "https://api.openai.com/v1";

  return new OpenAI({
    apiKey,
    baseURL: baseUrl ?? "https://api.openai.com/v1",
    dangerouslyAllowBrowser: true,
    ...(isNonOpenAI && { defaultHeaders: SUPPRESSED_STAINLESS_HEADERS }),
  });
}
