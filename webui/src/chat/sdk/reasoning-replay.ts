// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type streamText } from "ai";

type ProviderOptions = Parameters<typeof streamText>[0]["providerOptions"];

/**
 * Which signed reasoning to re-send with earlier assistant turns: none (false),
 * Anthropic's own blocks (true), or OpenRouter's `reasoning_details` saved from
 * the same model as this request (`openrouter` is the request's model id).
 */
export type ReasoningReplay = boolean | { openrouter: string };

/**
 * Pick the reasoning to re-send for a request. Anthropic's blocks are only
 * valid while its thinking is on. OpenRouter's are always offered; the request
 * rewrite drops them when its final body has reasoning off or isn't Claude (it
 * alone knows what the "Off" level really sends).
 * @param providerOptions - Provider options passed to streamText
 * @param modelId - The request's model id
 * @returns What to re-send
 */
export function reasoningReplayFor(
  providerOptions: ProviderOptions,
  modelId: string,
): ReasoningReplay {
  if (isAnthropicThinkingEnabled(providerOptions)) {
    return true;
  }

  return providerOptions?.openrouter != null ? { openrouter: modelId } : false;
}

/**
 * Whether the request's provider options enable Anthropic thinking. The API
 * rejects reasoning content when thinking is disabled, so never widen this
 * check to other namespaces: OpenRouter has its own, below.
 *
 * Keys off the `anthropic` namespace, so it is false on the OpenRouter→Claude
 * path. The Vercel gateway forwards `anthropic` options as-is, but its stream
 * carries no signature, so nothing signed is ever captured or re-sent there.
 * That also makes it harmless that `between_tools` (Sonnet 5.5 "Off") counts as
 * thinking on over the gateway but not on the direct route.
 * @param providerOptions - Provider options passed to streamText
 * @returns True when Anthropic thinking is enabled for this request
 */
function isAnthropicThinkingEnabled(providerOptions: ProviderOptions): boolean {
  const anthropic = providerOptions?.anthropic as
    | { thinking?: { type?: string } }
    | undefined;

  return anthropic?.thinking != null && anthropic.thinking.type !== "disabled";
}
