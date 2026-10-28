// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway, type LanguageModel } from "ai";
import { summarizeAdaptiveThinking } from "#webui/chat/sdk/provider/anthropic-thinking-display";
import { settleOpenRouterReasoningOff } from "#webui/chat/sdk/provider/openrouter-reasoning";
import { getThinkingOffType } from "#webui/chat/sdk/provider/thinking-effort";
import { type Provider } from "#webui/types/settings";
import {
  addCacheControl,
  type AnthropicRequestBody,
  ephemeral,
  markLastBlock,
} from "#webui/chat/sdk/provider/anthropic-cache-control";
import {
  rewritingFetch,
  type RewritingFetch,
} from "#webui/chat/sdk/provider/rewriting-fetch";
import { withDefaultUrl } from "#webui/utils/provider-url";

/**
 * Creates an AI SDK LanguageModel instance for the given provider.
 * LM Studio and custom OpenAI-compatible endpoints use
 * `@ai-sdk/openai-compatible` (which surfaces the `reasoning_content` field
 * local reasoning models emit as thinking; `@ai-sdk/openai`'s chat model
 * silently drops it). Ollama stays on `@ai-sdk/openai` because its thinking
 * control (`reasoning_effort`) rides on the `openai` providerOptions
 * namespace. OpenRouter uses its
 * own SDK; Gemini uses `@ai-sdk/google`; Vercel AI Gateway uses `ai`'s own.
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
        fetch: transformAnthropicRequest,
      })(modelId);

    case "openai":
      return createOpenAI({ apiKey })(modelId);

    case "openrouter":
      return createOpenRouter({
        apiKey,
        fetch: transformOpenRouterRequest,
      }).chat(modelId);

    case "vercel":
      return createGateway({ apiKey })(modelId);

    case "mistral":
      return createMistral({ apiKey })(modelId);

    case "lmstudio":
      return createOpenAICompatible({
        name: "lmstudio",
        apiKey: apiKey || "not-needed",
        baseURL: withDefaultUrl(baseUrl, "http://localhost:1234/v1"),
        // Without includeUsage the SDK omits `stream_options.include_usage`, so
        // OpenAI-compatible servers never emit a usage chunk and token counts
        // stay undefined (show as 0 in the UI).
        includeUsage: true,
      }).chatModel(modelId);

    case "ollama":
      return createOpenAI({
        apiKey: apiKey || "not-needed",
        baseURL: withDefaultUrl(baseUrl, "http://localhost:11434/v1"),
      }).chat(modelId);

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
      }).chatModel(modelId);
    }

    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(modelId);

    /* v8 ignore start -- exhaustive switch: all provider values handled above */
    default: {
      const _exhaustive: never = provider;

      return _exhaustive;
    }
    /* v8 ignore stop */
  }
}

/**
 * Rewrites the outgoing Anthropic request: `display: "summarized"` for adaptive
 * thinking, and prompt-caching breakpoints over the static prefix. Both are
 * wire-level because the AI SDK has no providerOptions for either — `display`
 * isn't supported yet, and placing `cache_control` exactly is far simpler on
 * the final request than through the provider-agnostic message builder.
 */
export const transformAnthropicRequest: RewritingFetch = rewritingFetch(
  (body) => applyAnthropicRewrites(body as AnthropicRequestBody),
);

/**
 * Apply the Anthropic wire-level rewrites to a parsed request body.
 * @param body - Parsed Anthropic request body (mutated in place)
 * @returns True when anything changed
 */
function applyAnthropicRewrites(body: AnthropicRequestBody): boolean {
  let modified = summarizeAdaptiveThinking(body);
  const offType = omittedThinkingOffType(body);

  if (offType != null) {
    // On adaptive-by-default models (Sonnet 5+), an omitted `thinking` field
    // runs adaptive thinking. The app omits `thinking` only for the "Off"
    // level, so inject what the model accepts for off: `between_tools` on
    // Sonnet 5.5 (400s on `disabled`), `disabled` elsewhere. Legacy (Haiku
    // 4.5) and always-on models keep the omitted-thinking body.
    body.thinking = { type: offType };
    modified = true;
  }

  // Called before the OR, not inside it: the breakpoints go on every request,
  // whether or not the thinking fields above changed.
  const cached = addCacheControl(body);

  return modified || cached;
}

/**
 * The `thinking` type to inject for a request that omits it (the app's "Off"),
 * or undefined to leave it omitted: legacy enabled-thinking models (Haiku 4.5),
 * always-on models (Opus 5.5 / Fable / Mythos) and pre-3.7 models (via the
 * free-text "Other..." input) all 400 on an injected field.
 * @param body - Parsed Anthropic request body
 * @returns The thinking type to inject, or undefined
 */
function omittedThinkingOffType(
  body: AnthropicRequestBody,
): "disabled" | "between_tools" | undefined {
  return body.thinking == null && typeof body.model === "string"
    ? getThinkingOffType(body.model)
    : undefined;
}

/** Minimal shape of one OpenAI/OpenRouter chat message we mutate. */
interface OpenRouterMessage {
  role?: string;
  content?: string | Array<Record<string, unknown>>;
}

/** Minimal shape of the OpenAI/OpenRouter chat-completions body we mutate. */
interface OpenRouterRequestBody {
  model?: string;
  reasoning?: { effort?: string };
  messages?: OpenRouterMessage[];
}

/**
 * Rewrites the outgoing OpenRouter request: settles the "Off" reasoning effort
 * for the model, and adds `cache_control` breakpoints for Anthropic and Gemini
 * models, which don't cache without them. The body is OpenAI-chat-shaped, so
 * breakpoints land inside message content blocks rather than on separate
 * system/tools fields.
 */
export const transformOpenRouterRequest: RewritingFetch = rewritingFetch(
  async (body) => {
    // Both steps run: `||` would skip the cache breakpoints once Off changed.
    const settled = await settleOpenRouterReasoningOff(
      body as OpenRouterRequestBody,
    );
    const cached = addOpenRouterCacheControl(body as OpenRouterRequestBody);

    return settled || cached;
  },
);

/**
 * Add `cache_control` breakpoints to an OpenRouter (OpenAI-shaped) request body
 * for Anthropic/Gemini models only. OpenAI/Grok/DeepSeek auto-cache, and Gemma
 * (an open model, not hosted Gemini) does not take these breakpoints — so gate
 * narrowly on the `anthropic/` and `google/gemini` model-id prefixes.
 *
 * Two breakpoints, both on message content:
 * 1. Static head — the system-role message (caches the system prefix; on
 *    Anthropic the upstream tool definitions render before it and are covered).
 * 2. Rolling tail — the last message (caches the full conversation prefix,
 *    including the ~9k-token ppal-connect skills tool result). For Gemini only
 *    this final breakpoint is used; for Anthropic both apply.
 *
 * @param body - Parsed OpenRouter request body (mutated in place)
 * @returns True if any breakpoint was added
 */
function addOpenRouterCacheControl(body: OpenRouterRequestBody): boolean {
  const model = body.model ?? "";
  const cacheable =
    model.startsWith("anthropic/") || model.startsWith("google/gemini");

  if (
    !cacheable ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0
  ) {
    return false;
  }

  let changed = false;

  // 1. Static head: the system message.
  const systemMessage = body.messages.find((m) => m.role === "system");

  if (systemMessage && markMessageContent(systemMessage)) {
    changed = true;
  }

  // 2. Rolling tail: the last message (may also be the system message — marking
  // the same content twice is idempotent).
  const lastMessage = body.messages.at(-1);

  if (lastMessage && markMessageContent(lastMessage)) {
    changed = true;
  }

  return changed;
}

/**
 * Add a cache_control breakpoint to a chat message's content: promote a non-empty
 * string to a single cached text block, or mark the last block of a non-empty
 * content array. No-op (returns false) for empty/absent content.
 * @param message - Chat message whose content is marked in place
 * @returns True if a breakpoint was added
 */
function markMessageContent(message: OpenRouterMessage): boolean {
  const content = message.content;

  if (typeof content === "string" && content.length > 0) {
    message.content = [
      { type: "text", text: content, cache_control: ephemeral() },
    ];

    return true;
  }

  if (Array.isArray(content) && content.length > 0) {
    markLastBlock(content);

    return true;
  }

  return false;
}
