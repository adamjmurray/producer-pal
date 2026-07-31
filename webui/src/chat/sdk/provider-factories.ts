// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel } from "ai";
import {
  isAlwaysOnThinkingModel,
  isLegacyNonThinkingModel,
  isLegacyThinkingModel,
} from "#webui/hooks/settings/config-builders";
import { type Provider } from "#webui/types/settings";

/**
 * Creates an AI SDK LanguageModel instance for the given provider.
 * LM Studio and custom OpenAI-compatible endpoints use
 * `@ai-sdk/openai-compatible` (which surfaces the `reasoning_content` field
 * local reasoning models emit as thinking; `@ai-sdk/openai`'s chat model
 * silently drops it). Ollama stays on `@ai-sdk/openai` because its thinking
 * control rides on the `openai` providerOptions namespace. OpenRouter uses its
 * own SDK; Gemini uses `@ai-sdk/google`.
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

    case "mistral":
      return createMistral({ apiKey })(modelId);

    case "lmstudio":
      return createOpenAICompatible({
        name: "lmstudio",
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl ?? "http://localhost:1234/v1",
        // Without includeUsage the SDK omits `stream_options.include_usage`, so
        // OpenAI-compatible servers never emit a usage chunk and token counts
        // stay undefined (show as 0 in the UI).
        includeUsage: true,
      }).chatModel(modelId);

    case "ollama":
      return createOpenAI({
        apiKey: apiKey || "not-needed",
        baseURL: baseUrl ?? "http://localhost:11434/v1",
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

/** Minimal shape of the Anthropic Messages API request body we mutate. */
interface AnthropicRequestBody {
  model?: string;
  thinking?: { type?: string; display?: string };
  system?: string | Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
  messages?: Array<{
    role?: string;
    content?: string | Array<Record<string, unknown>>;
  }>;
}

/**
 * Custom fetch wrapper that rewrites the outgoing Anthropic Messages API request
 * body to (1) inject `display: "summarized"` for adaptive thinking and (2) add
 * prompt-caching breakpoints over the static prefix.
 *
 * Both are wire-level workarounds applied here rather than via AI SDK
 * providerOptions: the thinking `display` field isn't natively supported yet,
 * and placing `cache_control` precisely (system string, MCP-sourced tools,
 * generically-built messages) is far simpler on the final request than threading
 * it through the provider-agnostic message builder. Only Anthropic needs this —
 * OpenAI/Gemini/OpenRouter cache automatically and we never reorder their prefix.
 *
 * The body is only re-serialized when something actually changed, so requests
 * that need no transform pass through byte-for-byte.
 *
 * @param input - Fetch input (URL or Request)
 * @param init - Fetch init options
 * @returns Fetch response
 */
export async function transformAnthropicRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as AnthropicRequestBody;
      let modified = false;

      if (body.thinking?.type === "adaptive" && !body.thinking.display) {
        // "summarized" returns a human-readable summary of the thinking, but the
        // block's signature still covers the full underlying reasoning. The
        // signature — not the visible summary text — is Anthropic's source of
        // truth, so replaying a captured summarized block verbatim with its
        // original signature on later turns is supported (see build-model-messages
        // buildAssistantContent, which re-emits the signed block as-is).
        body.thinking.display = "summarized";
        modified = true;
      }

      if (shouldForceThinkingDisabled(body)) {
        // On adaptive-by-default models (Sonnet 5+), an omitted `thinking` field
        // runs adaptive thinking. The app omits `thinking` only for the "Off"
        // level, and the @ai-sdk/anthropic provider drops a providerOptions
        // `{type:"disabled"}` before it reaches the wire, so make the choice
        // explicit here to honor "Off". Legacy (Haiku) and always-on (Fable /
        // Mythos, which 400 on disabled) models keep the omitted-thinking body.
        body.thinking = { type: "disabled" };
        modified = true;
      }

      if (addCacheControl(body)) modified = true;

      if (modified) {
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // Not JSON — pass through unchanged
    }
  }

  return await fetch(input, init);
}

/**
 * Whether an omitted `thinking` field should be forced to `{type: "disabled"}`.
 * True for adaptive-by-default Anthropic models where omitting `thinking` would
 * otherwise run adaptive thinking (Sonnet 5+); false for legacy enabled-thinking
 * models (Haiku), always-on models (Fable / Mythos) that reject `disabled`, and
 * pre-3.7 models (via the free-text "Other..." input) that reject the `thinking`
 * field entirely — injecting `disabled` on those 400s every send.
 * @param body - Parsed Anthropic request body
 * @returns True when `{type: "disabled"}` should be injected
 */
function shouldForceThinkingDisabled(body: AnthropicRequestBody): boolean {
  return (
    body.thinking == null &&
    typeof body.model === "string" &&
    !isLegacyThinkingModel(body.model) &&
    !isAlwaysOnThinkingModel(body.model) &&
    !isLegacyNonThinkingModel(body.model)
  );
}

/** Minimal shape of one OpenAI/OpenRouter chat message we mutate. */
interface OpenRouterMessage {
  role?: string;
  content?: string | Array<Record<string, unknown>>;
}

/** Minimal shape of the OpenAI/OpenRouter chat-completions body we mutate. */
interface OpenRouterRequestBody {
  model?: string;
  messages?: OpenRouterMessage[];
}

/**
 * Custom fetch wrapper for the OpenRouter provider that injects `cache_control`
 * breakpoints for Anthropic and Gemini models. OpenRouter is a pass-through:
 * OpenAI/Grok/DeepSeek-family models cache automatically, but Anthropic and
 * Gemini require explicit breakpoints (the same as the direct Anthropic SDK
 * path) — without them, Claude/Gemini via OpenRouter get no prompt caching.
 *
 * Mirrors {@link transformAnthropicRequest}, but the body is OpenAI-chat-shaped
 * (a `messages` array with a `system`-role message; no separate `system`/`tools`
 * cache target), so breakpoints land on message content blocks. OpenRouter wants
 * `cache_control` inside content blocks; for Gemini only the LAST breakpoint is
 * honored (extra ones are safe), so the rolling tail covers the whole prefix.
 *
 * The body is only re-serialized when something changed, so non-Anthropic/Gemini
 * requests (and any that need no transform) pass through byte-for-byte.
 *
 * @param input - Fetch input (URL or Request)
 * @param init - Fetch init options
 * @returns Fetch response
 */
export async function transformOpenRouterRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as OpenRouterRequestBody;

      if (addOpenRouterCacheControl(body)) {
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // Not JSON — pass through unchanged
    }
  }

  return await fetch(input, init);
}

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

  if (systemMessage && markMessageContent(systemMessage)) changed = true;

  // 2. Rolling tail: the last message (may also be the system message — marking
  // the same content twice is idempotent).
  const lastMessage = body.messages.at(-1);

  if (lastMessage && markMessageContent(lastMessage)) changed = true;

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

/**
 * Build a fresh ephemeral cache_control marker (5-minute TTL).
 * @returns A new `{ type: "ephemeral" }` object
 */
function ephemeral(): Record<string, unknown> {
  return { type: "ephemeral" };
}

/**
 * Add `cache_control` breakpoints to an Anthropic request body so the large
 * static prefix (tools + system prompt + the ppal-connect skills blob) isn't
 * re-billed every turn. Two breakpoints, within Anthropic's limit of four:
 *
 * 1. Static head — on the system block. Anthropic renders `tools → system`, so a
 *    breakpoint here caches the tool definitions AND the system prompt together.
 *    Falls back to the last tool when there's no system prompt.
 * 2. Rolling tail — on the last content block of the last message. This caches
 *    the whole conversation prefix (including the ~9k-token ppal-connect skills
 *    result that lives in the message history) and grows incrementally each turn.
 *    It also degrades gracefully across compaction: the static head stays cached
 *    while only the tail re-caches from the new boundary forward.
 *
 * Cross-turn note (adaptive thinking, the common case): the assistant turn that
 * calls a tool carries a signed thinking block. The SDK used to drop it on later
 * turns, diverging the prefix right after that turn so reads stopped at the
 * static head. That is now recovered: build-model-messages re-emits the signed
 * thinking block (gated on thinking being enabled), keeping the prefix byte-
 * stable so the rolling tail — including the ppal-connect skills blob — stays
 * cached. The head (tools + system) caches on every request regardless.
 *
 * @param body - Parsed Anthropic request body (mutated in place)
 * @returns True if any breakpoint was added
 */
function addCacheControl(body: AnthropicRequestBody): boolean {
  let changed = false;

  // 1. Static head: tools + system.
  if (typeof body.system === "string" && body.system.length > 0) {
    body.system = [
      { type: "text", text: body.system, cache_control: ephemeral() },
    ];
    changed = true;
  } else if (Array.isArray(body.system) && body.system.length > 0) {
    markLastBlock(body.system);
    changed = true;
  } else if (Array.isArray(body.tools) && body.tools.length > 0) {
    markLastBlock(body.tools);
    changed = true;
  }

  // 2. Rolling tail: the full conversation prefix up to the latest turn.
  // at(-1) of an empty/absent array is undefined, so no separate length guard.
  const lastMessage = Array.isArray(body.messages)
    ? body.messages.at(-1)
    : undefined;

  if (lastMessage) {
    const content = lastMessage.content;

    if (Array.isArray(content) && content.length > 0) {
      markLastBlock(content);
      changed = true;
    } else if (typeof content === "string" && content.length > 0) {
      lastMessage.content = [
        { type: "text", text: content, cache_control: ephemeral() },
      ];
      changed = true;
    }
  }

  return changed;
}

/**
 * Mark the last block of a non-empty array with an ephemeral cache_control.
 * Callers guarantee the array is non-empty, so the last element is defined.
 * @param blocks - Non-empty array of content/tool/system blocks
 */
function markLastBlock(blocks: Array<Record<string, unknown>>): void {
  const last = blocks.at(-1) as Record<string, unknown>;

  last.cache_control = ephemeral();
}
