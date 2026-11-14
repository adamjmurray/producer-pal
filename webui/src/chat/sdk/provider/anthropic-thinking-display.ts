// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// No imports: evals use this file too and resolve `#webui` paths differently.

/** The part of an Anthropic request body this file touches. */
export interface ThinkingRequestBody {
  thinking?: { type?: string; display?: string };
}

/**
 * Ask for `display: "summarized"` on an adaptive-thinking request. The AI SDK
 * has no providerOptions for it, so it's added to the wire body.
 *
 * "summarized" returns a human-readable summary of the thinking, but the
 * block's signature still covers the full underlying reasoning. The signature
 * — not the visible summary text — is Anthropic's source of truth, so
 * replaying a captured summarized block verbatim with its original signature
 * on later turns is supported (see build-model-messages buildAssistantContent,
 * which re-emits the signed block as-is).
 * @param body - Parsed Anthropic request body (mutated in place)
 * @returns True when it changed the body
 */
export function summarizeAdaptiveThinking(body: ThinkingRequestBody): boolean {
  if (body.thinking?.type !== "adaptive" || body.thinking.display) {
    return false;
  }

  body.thinking.display = "summarized";

  return true;
}
