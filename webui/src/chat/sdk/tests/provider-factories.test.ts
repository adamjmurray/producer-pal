// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  createProviderModel,
  transformAnthropicRequest,
  transformOpenRouterRequest,
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

/** Minimal typed view of the parsed Anthropic request body for assertions. */
interface CacheBlock {
  type?: string;
  text?: string;
  cache_control?: { type: string };
}
interface ParsedBody {
  thinking?: { type?: string; display?: string };
  system?: CacheBlock[] | string;
  tools?: CacheBlock[];
  messages?: Array<{ role?: string; content?: CacheBlock[] }>;
}

/**
 * Extract the body string from the first call to the mock fetch.
 * @param mockFetch - Vitest mock function
 * @returns The request body string
 */
function getCallBody(mockFetch: ReturnType<typeof vi.fn>): string {
  const init = mockFetch.mock.calls[0]![1] as RequestInit;

  return init.body as string;
}

type TransformFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Run a transform over a JSON body and return the parsed forwarded body.
 * @param transformFn - The fetch-wrapping transform under test
 * @param url - Request URL
 * @param body - Request body object (JSON-serialized before the transform)
 * @returns Parsed body the transform forwarded to fetch
 */
async function runTransform<T>(
  transformFn: TransformFn,
  url: string,
  body: unknown,
): Promise<T> {
  const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

  globalThis.fetch = mockFetch;
  await transformFn(url, { method: "POST", body: JSON.stringify(body) });

  return JSON.parse(getCallBody(mockFetch)) as T;
}

/**
 * Assert the transform forwards the given raw body string byte-for-byte.
 * @param transformFn - The fetch-wrapping transform under test
 * @param url - Request URL
 * @param rawBody - Raw request body string
 */
async function expectPassthrough(
  transformFn: TransformFn,
  url: string,
  rawBody: string,
): Promise<void> {
  const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

  globalThis.fetch = mockFetch;
  await transformFn(url, { method: "POST", body: rawBody });

  expect(getCallBody(mockFetch)).toBe(rawBody);
}

describe("transformAnthropicRequest", () => {
  const url = "https://api.anthropic.com/v1/messages";

  const transform = (body: unknown): Promise<ParsedBody> =>
    runTransform<ParsedBody>(transformAnthropicRequest, url, body);

  describe("thinking display", () => {
    it("injects display: summarized for adaptive thinking", async () => {
      const parsed = await transform({ thinking: { type: "adaptive" } });

      expect(parsed.thinking?.display).toBe("summarized");
    });

    it("does not modify enabled thinking (Haiku 4.5)", async () => {
      const parsed = await transform({
        thinking: { type: "enabled", budget_tokens: 10240 },
      });

      expect(parsed.thinking?.display).toBeUndefined();
    });

    it("does not override existing display value", async () => {
      const parsed = await transform({
        thinking: { type: "adaptive", display: "omitted" },
      });

      expect(parsed.thinking?.display).toBe("omitted");
    });
  });

  describe("forced disabled thinking", () => {
    it("injects disabled thinking when omitted on adaptive-by-default models", async () => {
      const parsed = await transform({ model: "claude-sonnet-5" });

      expect(parsed.thinking).toStrictEqual({ type: "disabled" });
    });

    it("leaves omitted thinking alone for legacy (Haiku) models", async () => {
      const parsed = await transform({ model: "claude-haiku-4-5" });

      expect(parsed.thinking).toBeUndefined();
    });

    it("leaves omitted thinking alone for always-on (Fable) models", async () => {
      const parsed = await transform({ model: "claude-fable-5-1" });

      expect(parsed.thinking).toBeUndefined();
    });

    it("leaves omitted thinking alone for pre-3.7 models typed via Other", async () => {
      // These ids reject the `thinking` field entirely; injecting disabled 400s.
      const parsed = await transform({ model: "claude-3-5-sonnet-20241022" });

      expect(parsed.thinking).toBeUndefined();
    });

    it("does not override adaptive thinking with disabled", async () => {
      const parsed = await transform({
        model: "claude-sonnet-5",
        thinking: { type: "adaptive" },
      });

      expect(parsed.thinking?.type).toBe("adaptive");
    });

    it("leaves omitted thinking alone when the model is absent", async () => {
      const parsed = await transform({ system: "sys" });

      expect(parsed.thinking).toBeUndefined();
    });
  });

  describe("prompt caching", () => {
    it("caches the system prompt (tools + system) and the last message", async () => {
      const parsed = await transform({
        system: "You are a helpful assistant.",
        tools: [{ name: "a" }, { name: "b" }],
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      });

      // String system is promoted to a cached text block
      expect(parsed.system).toStrictEqual([
        {
          type: "text",
          text: "You are a helpful assistant.",
          cache_control: { type: "ephemeral" },
        },
      ]);
      // Tools are not separately marked — they render before system and are
      // covered by the system breakpoint
      expect(parsed.tools?.[1]?.cache_control).toBeUndefined();
      // Rolling tail breakpoint on the last message's last content block
      expect(parsed.messages?.[0]?.content?.[0]?.cache_control).toStrictEqual({
        type: "ephemeral",
      });
    });

    it("marks the last block of an array-form system prompt", async () => {
      const parsed = await transform({
        system: [
          { type: "text", text: "preamble" },
          { type: "text", text: "rules" },
        ],
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      });

      const system = parsed.system as CacheBlock[];

      expect(system[0]?.cache_control).toBeUndefined();
      expect(system[1]?.cache_control).toStrictEqual({ type: "ephemeral" });
    });

    it("falls back to the last tool when there is no system prompt", async () => {
      const parsed = await transform({
        tools: [{ name: "a" }, { name: "b" }],
        messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      });

      expect(parsed.tools?.[0]?.cache_control).toBeUndefined();
      expect(parsed.tools?.[1]?.cache_control).toStrictEqual({
        type: "ephemeral",
      });
    });

    it("marks the last block of the last message, not earlier blocks", async () => {
      const parsed = await transform({
        system: "sys",
        messages: [
          { role: "user", content: [{ type: "text", text: "first" }] },
          {
            role: "user",
            content: [
              { type: "text", text: "a" },
              { type: "text", text: "b" },
            ],
          },
        ],
      });

      expect(parsed.messages?.[0]?.content?.[0]?.cache_control).toBeUndefined();
      expect(parsed.messages?.[1]?.content?.[0]?.cache_control).toBeUndefined();
      expect(parsed.messages?.[1]?.content?.[1]?.cache_control).toStrictEqual({
        type: "ephemeral",
      });
    });

    it("promotes a string message content to a cached block", async () => {
      const parsed = await transform({
        system: "sys",
        messages: [{ role: "user", content: "hello" }],
      });

      expect(parsed.messages?.[0]?.content).toStrictEqual([
        { type: "text", text: "hello", cache_control: { type: "ephemeral" } },
      ]);
    });

    it("does not add a tail breakpoint for empty message content", async () => {
      // Defensive: a final message with empty/absent content gets no tail
      // breakpoint, but the static head is still cached.
      const emptyArray = await transform({
        system: "sys",
        messages: [{ role: "user", content: [] }],
      });
      const emptyString = await transform({
        system: "sys",
        messages: [{ role: "user", content: "" }],
      });

      expect(emptyArray.messages?.[0]?.content).toStrictEqual([]);
      expect(emptyString.messages?.[0]?.content).toBe("");
      // Head still cached in both cases
      expect(
        (emptyArray.system as CacheBlock[])[0]?.cache_control,
      ).toStrictEqual({ type: "ephemeral" });
    });

    it("leaves a request with no cacheable prefix untouched", async () => {
      // Haiku is excluded from disabled-thinking injection, so this body needs
      // no transform at all and must pass through byte-for-byte.
      await expectPassthrough(
        transformAnthropicRequest,
        url,
        JSON.stringify({ model: "claude-haiku-4-5", messages: [] }),
      );
    });
  });

  it("passes through non-JSON bodies unchanged", async () => {
    await expectPassthrough(transformAnthropicRequest, url, "not json");
  });

  it("forwards a request with no body at all", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

    globalThis.fetch = mockFetch;
    await transformAnthropicRequest(url, { method: "GET" });

    expect(mockFetch).toHaveBeenCalledWith(url, { method: "GET" });
  });
});

/** Minimal typed view of a parsed OpenRouter (OpenAI-shaped) request body. */
interface OpenRouterParsedBody {
  model?: string;
  messages?: Array<{ role?: string; content?: string | CacheBlock[] }>;
}

describe("transformOpenRouterRequest", () => {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  const transform = (body: unknown): Promise<OpenRouterParsedBody> =>
    runTransform<OpenRouterParsedBody>(transformOpenRouterRequest, url, body);

  it("caches the system message and the rolling tail for Anthropic models", async () => {
    const parsed = await transform({
      model: "anthropic/claude-sonnet-4.6",
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hi" },
      ],
    });

    // String system content is promoted to a cached text block
    expect(parsed.messages?.[0]?.content).toStrictEqual([
      {
        type: "text",
        text: "You are helpful.",
        cache_control: { type: "ephemeral" },
      },
    ]);
    // Rolling tail breakpoint on the last message
    expect(parsed.messages?.[1]?.content).toStrictEqual([
      { type: "text", text: "hi", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("caches Gemini models (google/gemini prefix)", async () => {
    const parsed = await transform({
      model: "google/gemini-3.8-flash",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(
      (parsed.messages![0]!.content as CacheBlock[])[0]?.cache_control,
    ).toStrictEqual({ type: "ephemeral" });
  });

  it("marks the last block of an array-form last message", async () => {
    const parsed = await transform({
      model: "anthropic/claude-opus-5",
      messages: [
        { role: "system", content: "sys" },
        {
          role: "user",
          content: [
            { type: "text", text: "a" },
            { type: "text", text: "b" },
          ],
        },
      ],
    });

    const content = parsed.messages?.[1]?.content as CacheBlock[];

    expect(content[0]?.cache_control).toBeUndefined();
    expect(content[1]?.cache_control).toStrictEqual({ type: "ephemeral" });
  });

  it("leaves OpenAI-family models untouched (they auto-cache)", async () => {
    await expectPassthrough(
      transformOpenRouterRequest,
      url,
      JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "hi" },
        ],
      }),
    );
  });

  it("leaves Gemma (not Gemini) untouched", async () => {
    await expectPassthrough(
      transformOpenRouterRequest,
      url,
      JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        messages: [{ role: "user", content: "hi" }],
      }),
    );
  });

  it("does not add a tail breakpoint for empty message content", async () => {
    const parsed = await transform({
      model: "anthropic/claude-sonnet-4.6",
      messages: [{ role: "user", content: "" }],
    });

    expect(parsed.messages?.[0]?.content).toBe("");
  });

  it("passes through a body with no messages untouched", async () => {
    await expectPassthrough(
      transformOpenRouterRequest,
      url,
      JSON.stringify({ model: "anthropic/claude-sonnet-4.6" }),
    );
  });

  it("passes through non-JSON bodies unchanged", async () => {
    await expectPassthrough(transformOpenRouterRequest, url, "not json");
  });

  it("forwards a request with no body at all", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));

    globalThis.fetch = mockFetch;
    await transformOpenRouterRequest(url, { method: "GET" });

    expect(mockFetch).toHaveBeenCalledWith(url, { method: "GET" });
  });

  it("treats a body with no model as uncacheable", async () => {
    await expectPassthrough(
      transformOpenRouterRequest,
      url,
      JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    );
  });
});
