// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Gemini's thought signatures, kept on the part they sign and re-sent with it.
 * Dropping them changes how earlier steps are sent, so Gemini's cache misses.
 */

import { type ChatMessage } from "#webui/chat/sdk/types";

/**
 * Keep the signature a stream part carries on the part it signs: the step's
 * text, a tool call, or the current thought summary. The last one a part sees
 * wins, as in the SDK's own step content.
 * @param type - Stream part type
 * @param part - The stream part
 * @param msg - Message being built (already holding the part being signed)
 */
export function captureThoughtSignature(
  type: string,
  part: Record<string, unknown>,
  msg: ChatMessage,
): void {
  const providerMetadata = part.providerMetadata as
    | { google?: { thoughtSignature?: unknown } }
    | undefined;
  const signature = providerMetadata?.google?.thoughtSignature;

  if (typeof signature !== "string") {
    return;
  }

  if (type === "text-delta") {
    msg.textThoughtSignature = signature;
  } else if (type === "tool-call") {
    // handleStreamPart has just added this call.
    const calls = msg.toolCalls as NonNullable<ChatMessage["toolCalls"]>;

    for (const tc of calls) {
      if (tc.id === part.toolCallId) {
        tc.thoughtSignature = signature;
      }
    }
  } else if (type.startsWith("reasoning-")) {
    const last = msg.reasoningParts?.at(-1);

    if (last) {
      last.thoughtSignature = signature;
    }
  }
}

/**
 * Attach a Gemini signature to a message part being re-sent.
 * @param part - Model message part
 * @param signature - Its captured signature, if any
 * @returns The part, carrying the signature when there is one
 */
export function withThoughtSignature<T extends object>(
  part: T,
  signature: string | undefined,
): T {
  return signature == null
    ? part
    : { ...part, providerOptions: { google: { thoughtSignature: signature } } };
}
