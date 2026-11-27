// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { type LanguageModel, streamText } from "ai";
import { vi } from "vitest";

type ProviderOptions = Parameters<typeof streamText>[0]["providerOptions"];

/**
 * Send one chat request that asks for thinking, and record every URL fetched.
 * The server says the model thinks; the chat request itself fails.
 * @param model - The model to send it with
 * @param providerOptions - Options that ask for a thinking effort
 * @returns The URLs fetched, in order
 */
export async function fetchedThinkingUrls(
  model: LanguageModel,
  providerOptions: ProviderOptions,
): Promise<string[]> {
  const urls: string[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown) => {
      urls.push(String(url));

      return Promise.resolve(
        String(url).endsWith("/api/show")
          ? Response.json({ capabilities: ["thinking"] })
          : new Response("{}", { status: 500 }),
      );
    }),
  );

  const result = streamText({
    model,
    maxRetries: 0,
    messages: [{ role: "user", content: "hi" }],
    providerOptions,
    onError: () => {},
  });

  for await (const part of result.stream) {
    void part;
  }

  return urls;
}
