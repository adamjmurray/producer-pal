// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** Minimal shape of the Anthropic Messages API request body we mutate. */
export interface AnthropicRequestBody {
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
 * Add `cache_control` breakpoints to an Anthropic request body so the large
 * static prefix (tools + system prompt + the ppal-connect skills blob) isn't
 * re-billed every turn. Two breakpoints, within Anthropic's limit of four:
 *
 * 1. Static head — on the system block. Anthropic renders `tools → system`, so
 *    one breakpoint there covers both. Falls back to the last tool when there
 *    is no system prompt.
 * 2. Rolling tail — the last content block of the last message, which caches
 *    the whole conversation prefix and grows each turn.
 *
 * The rolling tail only holds if the prefix stays byte-stable across turns,
 * which is why build-model-messages re-emits the signed thinking block rather
 * than dropping it. The head caches on every request regardless.
 *
 * @param body - Parsed Anthropic request body (mutated in place)
 * @returns True if any breakpoint was added
 */
export function addCacheControl(body: AnthropicRequestBody): boolean {
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
export function markLastBlock(blocks: Array<Record<string, unknown>>): void {
  const last = blocks.at(-1) as Record<string, unknown>;

  last.cache_control = ephemeral();
}

/**
 * Build a fresh ephemeral cache_control marker (5-minute TTL).
 * @returns A new `{ type: "ephemeral" }` object
 */
export function ephemeral(): Record<string, unknown> {
  return { type: "ephemeral" };
}
