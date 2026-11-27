// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchedThinkingUrls } from "#webui/chat/sdk/provider/local-model/tests/thinking-lookup-test-helpers.ts";
import { createProviderModel } from "#evals/chat/provider.ts";
import { resetOllamaThinkingCache } from "#webui/chat/sdk/provider/local-model/ollama-thinking.ts";

// With --thinking, the local provider asks Ollama which models think. That
// request must go to the same place as chat: LOCAL_BASE_URL's path prefix
// kept, `/v1` and a trailing slash ignored.

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

    const urls = await fetchedThinkingUrls(
      createProviderModel("local", "qwen3.8"),
      {
        local: { reasoningEffort: "high" },
      },
    );

    expect(urls[0]).toBe(`${root}/api/show`);
  });
});
