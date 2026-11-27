// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchedThinkingUrls } from "#webui/chat/sdk/provider/local-model/tests/thinking-lookup-test-helpers";
import { resetOllamaThinkingCache } from "#webui/chat/sdk/provider/local-model/ollama-thinking";
import { createProviderModel } from "#webui/chat/sdk/provider/provider-factories";

// With thinking on, the Ollama model asks the server which models think. That
// request must go to the same place as chat: the URL setting's path prefix
// kept, `/v1` and a trailing slash ignored.

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
    const urls = await fetchedThinkingUrls(
      createProviderModel("ollama", "qwen3.8", "", baseUrl),
      { ollama: { reasoningEffort: "high" } },
    );

    expect(urls[0]).toBe(`${root}/api/show`);
  });
});
