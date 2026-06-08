// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createProviderModel,
  injectThinkingDisplay,
} from "#webui/chat/sdk/provider-factories";

// The LanguageModel type is a union — cast to access runtime modelId property
const getModelId = (model: unknown): string =>
  (model as Record<string, unknown>).modelId as string;

// The `provider` field tags the API surface. @ai-sdk/openai uses "openai.chat"
// for the Chat Completions API (.chat()) vs "openai.responses" for the default
// factory (Responses API). @ai-sdk/openai-compatible tags "<name>.chat" (e.g.
// "lmstudio.chat"). Either way the value MUST end in ".chat": local servers
// only implement Chat Completions and reject the Responses API's `input` field
// with "Invalid type for 'input'". LM Studio and custom endpoints route through
// @ai-sdk/openai-compatible so their `reasoning_content` shows as thinking;
// Ollama stays on @ai-sdk/openai (its `think` option needs that namespace).
const getApiProvider = (model: unknown): string =>
  (model as Record<string, unknown>).provider as string;

// @ai-sdk/openai-compatible only emits `stream_options.include_usage` (so the
// server reports token counts during streaming) when `includeUsage: true` is in
// the model config. Without it, LM Studio/custom token usage stays undefined and
// shows as 0 in the UI. The setting lands on the model's runtime `config`.
const getIncludeUsage = (model: unknown): unknown =>
  ((model as Record<string, unknown>).config as Record<string, unknown>)
    .includeUsage;

describe("createProviderModel", () => {
  it("creates a model for anthropic provider", () => {
    const model = createProviderModel(
      "anthropic",
      "claude-sonnet-4-6-20250514",
      "test-key",
    );

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("claude-sonnet-4-6-20250514");
  });

  it("creates a model for openai provider", () => {
    const model = createProviderModel("openai", "gpt-4o", "test-key");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("gpt-4o");
  });

  it("creates a model for openrouter provider", () => {
    const model = createProviderModel("openrouter", "claude-3.5-sonnet", "key");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("claude-3.5-sonnet");
  });

  it("creates a model for mistral provider", () => {
    const model = createProviderModel("mistral", "mistral-large", "key");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("mistral-large");
  });

  it("creates a model for lmstudio provider with default URL", () => {
    const model = createProviderModel("lmstudio", "local-model", "not-needed");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("local-model");
  });

  it("creates a model for lmstudio provider with custom URL", () => {
    const model = createProviderModel(
      "lmstudio",
      "local-model",
      "not-needed",
      "http://192.168.1.100:1234/v1",
    );

    expect(model).toBeDefined();
  });

  it("creates a model for ollama provider with default URL", () => {
    const model = createProviderModel("ollama", "llama3", "not-needed");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("llama3");
  });

  it("creates a model for ollama provider with custom URL", () => {
    const model = createProviderModel(
      "ollama",
      "llama3",
      "not-needed",
      "http://192.168.1.100:11434/v1",
    );

    expect(model).toBeDefined();
  });

  it("creates a model for custom provider", () => {
    const model = createProviderModel(
      "custom",
      "my-model",
      "key",
      "https://custom.api.com/v1",
    );

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("my-model");
  });

  it("throws an actionable error for custom provider without a URL", () => {
    // baseUrl defaults to "" in settings, so the empty-string path is the real
    // failure mode; whitespace-only and missing baseUrl take the same branch.
    expect(() => createProviderModel("custom", "my-model", "key", "")).toThrow(
      /custom provider requires a url/i,
    );
    expect(() =>
      createProviderModel("custom", "my-model", "key", "   "),
    ).toThrow(/custom provider requires a url/i);
    expect(() => createProviderModel("custom", "my-model", "key")).toThrow(
      /custom provider requires a url/i,
    );
  });

  it("creates a model for gemini provider", () => {
    const model = createProviderModel("gemini", "gemini-2.0-flash", "key");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("gemini-2.0-flash");
  });

  it("uses fallback apiKey for lmstudio with empty key", () => {
    const model = createProviderModel("lmstudio", "local-model", "");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("local-model");
  });

  it("uses fallback apiKey for ollama with empty key", () => {
    const model = createProviderModel("ollama", "llama3", "");

    expect(model).toBeDefined();
    expect(getModelId(model)).toBe("llama3");
  });

  // Regression: LM Studio (and other local OpenAI-compatible servers) must hit
  // the Chat Completions API, not the Responses API. The default createOpenAI
  // factory routes to /v1/responses, which LM Studio rejects with a 400
  // "Invalid type for 'input'". @ai-sdk/openai-compatible is Chat-Completions-
  // only, so LM Studio/custom report "<name>.chat". See getApiProvider comment.
  it("uses the Chat Completions API for lmstudio (not Responses)", () => {
    const model = createProviderModel("lmstudio", "local-model", "");

    expect(getApiProvider(model)).toBe("lmstudio.chat");
  });

  it("uses the Chat Completions API for ollama (not Responses)", () => {
    const model = createProviderModel("ollama", "llama3", "");

    expect(getApiProvider(model)).toBe("openai.chat");
  });

  it("uses the Chat Completions API for custom (not Responses)", () => {
    const model = createProviderModel("custom", "m", "k", "https://x/v1");

    expect(getApiProvider(model)).toBe("custom.chat");
  });

  it("uses the Responses API for openai proper", () => {
    const model = createProviderModel("openai", "gpt-5.5", "key");

    expect(getApiProvider(model)).toBe("openai.responses");
  });

  // Regression: without includeUsage, OpenAI-compatible servers (LM Studio,
  // custom) never report token usage in streaming responses, so the UI shows 0.
  it("enables usage reporting for lmstudio (includeUsage)", () => {
    const model = createProviderModel("lmstudio", "local-model", "");

    expect(getIncludeUsage(model)).toBe(true);
  });

  it("enables usage reporting for custom (includeUsage)", () => {
    const model = createProviderModel("custom", "m", "k", "https://x/v1");

    expect(getIncludeUsage(model)).toBe(true);
  });
});

describe("injectThinkingDisplay", () => {
  const url = "https://api.anthropic.com/v1/messages";

  /**
   * Extract the body string from the first call to the mock fetch.
   * @param mockFetch - Vitest mock function
   * @returns The request body string
   */
  function getCallBody(mockFetch: ReturnType<typeof vi.fn>): string {
    const init = mockFetch.mock.calls[0]![1] as RequestInit;

    return init.body as string;
  }

  it("injects display: summarized for adaptive thinking", async () => {
    const body = JSON.stringify({ thinking: { type: "adaptive" } });
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

    globalThis.fetch = mockFetch;
    await injectThinkingDisplay(url, { method: "POST", body });

    const parsedBody = JSON.parse(getCallBody(mockFetch));

    expect(parsedBody.thinking.display).toBe("summarized");
  });

  it("does not modify enabled thinking (Haiku 4.5)", async () => {
    const body = JSON.stringify({
      thinking: { type: "enabled", budget_tokens: 10240 },
    });
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

    globalThis.fetch = mockFetch;
    await injectThinkingDisplay(url, { method: "POST", body });

    const parsedBody = JSON.parse(getCallBody(mockFetch));

    expect(parsedBody.thinking.display).toBeUndefined();
  });

  it("does not modify requests without thinking", async () => {
    const original = JSON.stringify({ model: "claude-opus-4-7", messages: [] });
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

    globalThis.fetch = mockFetch;
    await injectThinkingDisplay(url, { method: "POST", body: original });

    expect(getCallBody(mockFetch)).toBe(original);
  });

  it("does not override existing display value", async () => {
    const body = JSON.stringify({
      thinking: { type: "adaptive", display: "omitted" },
    });
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

    globalThis.fetch = mockFetch;
    await injectThinkingDisplay(url, { method: "POST", body });

    const parsedBody = JSON.parse(getCallBody(mockFetch));

    expect(parsedBody.thinking.display).toBe("omitted");
  });

  it("passes through non-JSON bodies unchanged", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

    globalThis.fetch = mockFetch;
    await injectThinkingDisplay(url, { method: "POST", body: "not json" });

    expect(getCallBody(mockFetch)).toBe("not json");
  });
});
