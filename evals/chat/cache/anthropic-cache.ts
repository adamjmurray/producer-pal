// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Prompt caching for eval runs on the Anthropic API. On top of the chat UI's
 * breakpoints (tools + system, and the conversation tail), mark the connect
 * turn's result: it holds the Skills and is byte-identical across scenarios on
 * the same Live Set, so every scenario after the first reads it from cache.
 * Also asks for summarized thinking, as the chat UI does.
 */

import { summarizeAdaptiveThinking } from "#webui/chat/sdk/provider/anthropic-thinking-display.ts";
import {
  addCacheControl,
  type AnthropicRequestBody,
  markLastBlock,
} from "#webui/chat/sdk/provider/anthropic-cache-control.ts";
import {
  rewritingFetch,
  type RewritingFetch,
} from "#webui/chat/sdk/provider/rewriting-fetch.ts";

/** The fetch to hand `createAnthropic` so eval requests are cached. */
export const cacheAnthropicRequest: RewritingFetch = rewritingFetch((body) => {
  const request = body as AnthropicRequestBody;
  const summarized = summarizeAdaptiveThinking(request);
  const connectMarked = markConnectResult(request);

  return addCacheControl(request) || connectMarked || summarized;
});

/**
 * Mark the last block of the first tool-result message: the connect turn,
 * seeded or not, since every scenario opens with it. Skipped when that message
 * is the last one, where the tail breakpoint already lands.
 *
 * @param body - Parsed Anthropic request body (mutated in place)
 * @returns True if a breakpoint was added
 */
export function markConnectResult(body: AnthropicRequestBody): boolean {
  const messages = body.messages ?? [];
  const index = messages.findIndex(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((block) => block.type === "tool_result"),
  );
  const content = messages[index]?.content;

  if (index === messages.length - 1 || !Array.isArray(content)) {
    return false;
  }

  markLastBlock(content);

  return true;
}
