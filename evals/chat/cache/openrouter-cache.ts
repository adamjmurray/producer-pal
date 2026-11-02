// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Prompt caching for eval runs through OpenRouter. On top of the chat UI's
 * breakpoints (system message and conversation tail), mark the connect turn's
 * result on Claude models: it holds the Skills and is byte-identical across
 * scenarios on the same Live Set, so every scenario after the first reads it
 * from cache. Reasoning Off is settled per model, as in the chat UI; unlike the
 * chat UI, earlier Claude reasoning is left alone.
 */

import {
  addOpenRouterCacheControl,
  markMessageContent,
  type OpenRouterRequestBody,
} from "#webui/chat/sdk/provider/openrouter-cache-control.ts";
import { settleOpenRouterReasoningOff } from "#webui/chat/sdk/provider/openrouter-reasoning.ts";
import {
  rewritingFetch,
  type RewritingFetch,
} from "#webui/chat/sdk/provider/rewriting-fetch.ts";

/** The fetch to hand `createOpenRouter` so eval requests are cached. */
export const cacheOpenRouterRequest: RewritingFetch = rewritingFetch(
  async (body) => {
    const request = body as OpenRouterRequestBody;
    // Every step runs: `||` would skip the later ones once an earlier one changed.
    const settled = await settleOpenRouterReasoningOff(request);
    const connectMarked = markOpenRouterConnectResult(request);
    const cached = addOpenRouterCacheControl(request);

    return settled || connectMarked || cached;
  },
);

/**
 * Mark the first tool message: the connect turn's result, since every scenario
 * opens with it. Claude models only (Gemini caches on the tail alone), and
 * skipped when that message is the last one, where the tail breakpoint already
 * lands.
 *
 * @param body - Parsed OpenRouter request body (mutated in place)
 * @returns True if a breakpoint was added
 */
export function markOpenRouterConnectResult(
  body: OpenRouterRequestBody,
): boolean {
  const messages = body.messages ?? [];
  const index = messages.findIndex((message) => message.role === "tool");
  const message = messages[index];

  if (
    message == null ||
    !body.model?.startsWith("anthropic/") ||
    index === messages.length - 1
  ) {
    return false;
  }

  return markMessageContent(message);
}
