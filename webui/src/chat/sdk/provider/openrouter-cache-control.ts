// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// No imports: evals use this file too and resolve `#webui` paths differently.

/** Minimal shape of one OpenAI/OpenRouter chat message we mutate. */
export interface OpenRouterMessage {
  role?: string;
  content?: string | Array<Record<string, unknown>>;
}

/** Minimal shape of the OpenAI/OpenRouter chat-completions body we mutate. */
export interface OpenRouterRequestBody {
  model?: string;
  reasoning?: { effort?: string };
  messages?: Array<
    OpenRouterMessage & {
      reasoning?: string;
      reasoning_details?: Array<{ format?: string }>;
    }
  >;
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
export function addOpenRouterCacheControl(
  body: OpenRouterRequestBody,
): boolean {
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
export function markMessageContent(message: OpenRouterMessage): boolean {
  const content = message.content;

  if (typeof content === "string" && content.length > 0) {
    message.content = [
      { type: "text", text: content, cache_control: { type: "ephemeral" } },
    ];

    return true;
  }

  if (Array.isArray(content) && content.length > 0) {
    (content.at(-1) as Record<string, unknown>).cache_control = {
      type: "ephemeral",
    };

    return true;
  }

  return false;
}
