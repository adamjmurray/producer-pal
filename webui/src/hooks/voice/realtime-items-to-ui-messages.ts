// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { safeParseToolArgs } from "#webui/chat/helpers/formatter-helpers";
import { type UIMessage, type UIToolPart } from "#webui/types/messages";

type AssistantMessageItem = Extract<
  RealtimeItem,
  { type: "message"; role: "assistant" }
>;

type UserMessageItem = Extract<RealtimeItem, { type: "message"; role: "user" }>;

type ToolCallItem = Extract<
  RealtimeItem,
  { type: "function_call" | "mcp_call" | "mcp_tool_call" }
>;

/**
 * Convert a RealtimeSession history list into chat UIMessages so the voice
 * transcript renders through the same `MessageList` / `AssistantMessage` /
 * `AssistantToolCall` components as text chat.
 *
 * Grouping: a user `message` starts a new user UIMessage; subsequent assistant
 * `message` items plus tool calls (`function_call`, `mcp_call`,
 * `mcp_tool_call`) before the next user message are merged into one model
 * UIMessage with interleaved text + tool parts — matching how chat AI SDK
 * messages already represent a multi-step assistant turn.
 *
 * Voice items have no per-item timestamp, so `timestamp` is set to 0; the chat
 * UI hides timestamps in voice mode anyway. `rawHistoryIndex` points at the
 * RealtimeItem that started each message (used for keys only — voice doesn't
 * support retry/edit).
 *
 * @param items - The current RealtimeSession history
 * @returns Equivalent chat UIMessages, in conversation order
 */
export function realtimeItemsToUIMessages(items: RealtimeItem[]): UIMessage[] {
  const messages: UIMessage[] = [];
  let currentModel: UIMessage | null = null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as RealtimeItem;

    if (item.type === "message" && item.role === "user") {
      currentModel = null;
      const text = extractUserText(item);

      if (!text) continue;
      messages.push({
        role: "user",
        parts: [{ type: "text", content: text }],
        rawHistoryIndex: i,
        timestamp: 0,
      });
    } else if (item.type === "message" && item.role === "assistant") {
      const text = extractAssistantText(item);

      if (!text) continue;
      currentModel = ensureCurrentModel(currentModel, messages, i);
      currentModel.parts.push({ type: "text", content: text });
    } else if (
      item.type === "function_call" ||
      item.type === "mcp_call" ||
      item.type === "mcp_tool_call"
    ) {
      currentModel = ensureCurrentModel(currentModel, messages, i);
      currentModel.parts.push(toolPart(item));
    }
    // system messages and mcp_approval_request items are not rendered in chat
  }

  return messages;
}

/**
 * Pull the visible text out of a user message item. Voice transcripts arrive
 * as `input_audio.transcript`; typed input comes through as `input_text`.
 *
 * @param item - The user message item
 * @returns Concatenated text, or empty string if none yet
 */
function extractUserText(item: UserMessageItem): string {
  return item.content
    .map((c) => {
      if (c.type === "input_text") return c.text;

      return c.transcript ?? "";
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * Pull the visible text out of an assistant message item. Spoken responses
 * arrive as `output_audio.transcript`; pure-text responses use `output_text`.
 *
 * @param item - The assistant message item
 * @returns Concatenated text, or empty string if none yet
 */
function extractAssistantText(item: AssistantMessageItem): string {
  return item.content
    .map((c) => {
      if (c.type === "output_text") return c.text;

      return c.transcript ?? "";
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * Build a UIToolPart from a realtime tool-call item. Detects our MCP wrapper's
 * error-string output (returned as plain text rather than JSON) and flags it
 * so AssistantToolCall renders the red error treatment.
 *
 * @param item - The tool-call item
 * @returns A tool UI part matching the chat schema
 */
function toolPart(item: ToolCallItem): UIToolPart {
  const result = item.output;
  const isError =
    result != null &&
    (result.startsWith("Error from ") || result.startsWith("Error calling "));

  return {
    type: "tool",
    name: item.name,
    args: safeParseToolArgs(item.arguments),
    result,
    ...(isError ? { isError: true } : {}),
  };
}

/**
 * Lazily create the current assistant UIMessage. Reuses the existing one if a
 * model turn is already in progress so multi-step turns collapse into a single
 * bubble matching chat behavior.
 *
 * @param current - The in-progress model UIMessage, or null
 * @param messages - The output list (mutated when a new message is appended)
 * @param itemIndex - Index of the realtime item that triggered creation
 * @returns The current (or newly created) model UIMessage
 */
function ensureCurrentModel(
  current: UIMessage | null,
  messages: UIMessage[],
  itemIndex: number,
): UIMessage {
  if (current) return current;
  const created: UIMessage = {
    role: "model",
    parts: [],
    rawHistoryIndex: itemIndex,
    timestamp: 0,
  };

  messages.push(created);

  return created;
}
