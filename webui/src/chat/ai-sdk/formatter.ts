// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  addTextContent,
  isErrorResult,
  markLastThoughtAsOpen,
} from "#webui/chat/helpers/formatter-helpers";
import { type UIMessage, type UIPart } from "#webui/types/messages";
import { type AiSdkMessage } from "./ai-sdk-types";

/**
 * Add reasoning content as a thought part.
 * @param reasoning - Reasoning text from the AI SDK
 * @param parts - Parts array to add to
 */
function addReasoning(reasoning: string | undefined, parts: UIPart[]): void {
  if (!reasoning) return;

  const lastPart = parts.at(-1);

  if (lastPart?.type === "thought") {
    lastPart.content += reasoning;
  } else {
    parts.push({ type: "thought", content: reasoning });
  }
}

/**
 * Add tool calls matched with their results to parts.
 * @param msg - AI SDK message containing tool calls and results
 * @param parts - Parts array to add to
 */
function addToolParts(msg: AiSdkMessage, parts: UIPart[]): void {
  if (!msg.toolCalls) return;

  for (const tc of msg.toolCalls) {
    // Find matching result
    const result = msg.toolResults?.find((tr) => tr.id === tc.id);
    const resultStr = result ? JSON.stringify(result.result) : null;

    parts.push({
      type: "tool",
      name: tc.name,
      args: tc.args,
      result: resultStr,
      isError: resultStr
        ? isErrorResult(resultStr) || result?.isError
        : undefined,
    });
  }
}

/**
 * Formats AI SDK messages into UI-friendly structure.
 *
 * Transformations applied:
 * 1. Maps user messages to UI format
 * 2. Maps assistant messages: reasoning → thought parts, text → text parts,
 *    tool calls + results → tool parts
 * 3. Merges consecutive assistant messages into single UI messages
 * 4. Tracks rawHistoryIndex for retry support
 * 5. Marks last thought as open for activity indicator
 *
 * @param history - Raw AI SDK message history
 * @returns Formatted messages for UI rendering
 */
export function formatAiSdkMessages(history: AiSdkMessage[]): UIMessage[] {
  const messages: UIMessage[] = [];

  for (let rawIndex = 0; rawIndex < history.length; rawIndex++) {
    const msg = history[rawIndex];

    if (!msg) continue;

    const lastMessage = messages.at(-1);
    let currentMessage: UIMessage;

    // Merge consecutive assistant messages
    if (lastMessage?.role === "model" && msg.role === "assistant") {
      currentMessage = lastMessage;
    } else {
      currentMessage = {
        role: msg.role === "assistant" ? "model" : "user",
        parts: [],
        rawHistoryIndex: rawIndex,
        timestamp: Date.now(),
      };
      messages.push(currentMessage);
    }

    if (msg.role === "user") {
      addTextContent(currentMessage.parts, msg.content);
    } else {
      // Assistant: reasoning first, then text, then tools
      addReasoning(msg.reasoning, currentMessage.parts);
      addTextContent(currentMessage.parts, msg.content);
      addToolParts(msg, currentMessage.parts);
    }
  }

  markLastThoughtAsOpen(messages);

  return messages;
}
