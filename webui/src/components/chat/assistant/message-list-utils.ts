// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type TokenUsage } from "#webui/chat/sdk/types";
import { type UIMessage } from "#webui/types/messages";

/**
 * Finds previous user message index for retry
 * @param messages - Messages array
 * @param currentIdx - Current message index
 * @returns Previous user message index or -1
 */
export function findPreviousUserMessageIndex(
  messages: UIMessage[],
  currentIdx: number,
): number {
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i;
  }

  return -1;
}

/**
 * Formats user message content as string
 * @param message - User message to format
 * @returns Concatenated text content
 */
export function formatUserContent(message: UIMessage): string {
  return message.parts
    .map((part) => ("content" in part ? part.content : ""))
    .join("");
}

/**
 * Get the last usage from the previous model message.
 * @param messages - All messages
 * @param currentIdx - Current message index
 * @returns Previous model message's last usage
 */
export function getPrevModelUsage(
  messages: UIMessage[],
  currentIdx: number,
): TokenUsage | undefined {
  for (let i = currentIdx - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg?.role !== "model") continue;

    return getLastStepUsage(msg) ?? msg.usage;
  }

  return undefined;
}

/**
 * Get the last step-usage part's usage within a message.
 * @param message - Message to search
 * @returns Last step-usage part's usage, or undefined
 */
export function getLastStepUsage(message: UIMessage): TokenUsage | undefined {
  const part = message.parts.findLast((p) => p.type === "step-usage");

  if (part?.type === "step-usage") return part.usage;

  return undefined;
}
