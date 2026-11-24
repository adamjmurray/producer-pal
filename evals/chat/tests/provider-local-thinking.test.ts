// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { streamText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProviderModel } from "#evals/chat/provider.ts";
import { resetOllamaThinkingCache } from "#webui/chat/sdk/provider/local-model/ollama-thinking.ts";

// With --thinking, the local provider asks Ollama which models think. That
// request must go to the same place as chat: LOCAL_BASE_URL's path prefix
// kept, `/v1` and a trailing slash ignored.

/**
 * Send one chat request with an effort and record every URL fetched.
 * @returns The URLs fetched, in order
 */
async function fetchedUrls(): Promise<string[]> {
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
    model: createProviderModel("local", "qwen3.8"),
    maxRetries: 0,
    messages: [{ role: "user", content: "hi" }],
    providerOptions: { local: { reasoningEffort: "high" } },
    onError: () => {},
  });

  for await (const part of result.stream) {
    void part;
  }

  return urls;
}

describe("local provider thinking lookup URL", () => {
  beforeEach(() => {
    resetOllamaThinkingCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ["http://localhost:11434/v1", "http://localhost:11434"],
    ["http://localhost:11434/v1/", "http://localhost:11434"],
    ["https://host/ollama/v1", "https://host/ollama"],
    ["https://host/ollama/v1/", "https://host/ollama"],
    ["https://host/ollama", "https://host/ollama"],
    ["https://host/ollama/", "https://host/ollama"],
  ])("for %s asks %s/api/show", async (baseUrl, root) => {
    vi.stubEnv("LOCAL_BASE_URL", baseUrl);

    const urls = await fetchedUrls();

    expect(urls[0]).toBe(`${root}/api/show`);
  });
});
