// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { streamText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetOllamaThinkingCache } from "#webui/chat/sdk/provider/local-model/ollama-thinking";
import { createProviderModel } from "#webui/chat/sdk/provider/provider-factories";

// With thinking on, the Ollama model asks the server which models think. That
// request must go to the same place as chat: the URL setting's path prefix
// kept, `/v1` and a trailing slash ignored.

/**
 * Send one chat request with an effort and record every URL fetched.
 * @param baseUrl - The Ollama URL setting
 * @returns The URLs fetched, in order
 */
async function fetchedUrls(baseUrl: string): Promise<string[]> {
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
    model: createProviderModel("ollama", "qwen3.8", "", baseUrl),
    maxRetries: 0,
    messages: [{ role: "user", content: "hi" }],
    providerOptions: { ollama: { reasoningEffort: "high" } },
    onError: () => {},
  });

  for await (const part of result.stream) {
    void part;
  }

  return urls;
}

describe("Ollama thinking lookup URL", () => {
  beforeEach(() => {
    resetOllamaThinkingCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["http://localhost:11434/v1", "http://localhost:11434"],
    ["http://localhost:11434/v1/", "http://localhost:11434"],
    ["http://localhost:11434", "http://localhost:11434"],
    ["https://host/ollama/v1", "https://host/ollama"],
    ["https://host/ollama/v1/", "https://host/ollama"],
    ["https://host/ollama", "https://host/ollama"],
    ["https://host/ollama/", "https://host/ollama"],
  ])("for %s asks %s/api/show", async (baseUrl, root) => {
    const urls = await fetchedUrls(baseUrl);

    expect(urls[0]).toBe(`${root}/api/show`);
  });
});
