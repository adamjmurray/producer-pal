// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Converters between OpenAI Chat Completions and Responses API conversation formats.
 * Useful for migrating saved chat history between API formats.
 */
import type { OpenAIMessage, OpenAIToolCall } from "#webui/types/messages";
import type { ResponsesConversationItem } from "#webui/types/responses-api";

/**
 * Get string content from a message
 * @param content - Message content (string or other format)
 * @returns String content or empty string
 */
function getStringContent(content: unknown): string {
  return typeof content === "string" ? content : "";
}

/**
 * Convert assistant tool calls to Responses API function_call items
 * @param msg - Assistant message with potential tool calls
 * @returns Array of function_call items
 */
function convertToolCalls(msg: OpenAIMessage): ResponsesConversationItem[] {
  if (msg.role !== "assistant" || !("tool_calls" in msg) || !msg.tool_calls) {
    return [];
  }

  return msg.tool_calls
    .filter((tc) => tc.type === "function")
    .map((tc) => ({
      type: "function_call" as const,
      id: tc.id,
      call_id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));
}

/**
 * Convert a single Chat Completions message to Responses API items
 * @param msg - Chat Completions message
 * @returns Array of Responses API items
 */
function convertSingleMessage(msg: OpenAIMessage): ResponsesConversationItem[] {
  const items: ResponsesConversationItem[] = [];

  if (msg.role === "system" || msg.role === "user") {
    items.push({
      type: "message",
      role: msg.role,
      content: getStringContent(msg.content),
    });
  } else if (msg.role === "assistant") {
    const content = getStringContent(msg.content);

    if (content) {
      items.push({ type: "message", role: "assistant", content });
    }

    items.push(...convertToolCalls(msg));
  } else if (msg.role === "tool" && "tool_call_id" in msg) {
    items.push({
      type: "function_call_output",
      call_id: msg.tool_call_id,
      output: getStringContent(msg.content),
    });
  }

  return items;
}

/**
 * Convert Chat Completions message format to Responses API format.
 * Handles: system, user, assistant (with tool_calls), tool messages.
 * @param messages - Array of Chat Completions messages
 * @returns Array of Responses API conversation items
 */
export function chatToResponsesHistory(
  messages: OpenAIMessage[],
): ResponsesConversationItem[] {
  return messages.flatMap(convertSingleMessage);
}

/**
 * State for building Chat Completions history from Responses items
 */
interface ConversionState {
  messages: OpenAIMessage[];
  currentAssistant: OpenAIMessage | null;
  pendingToolCalls: OpenAIToolCall[];
}

/**
 * Flush pending tool calls to the current assistant message
 * @param state - Conversion state to modify
 */
function flushPendingToolCalls(state: ConversionState): void {
  if (state.currentAssistant && state.pendingToolCalls.length > 0) {
    (state.currentAssistant as { tool_calls?: OpenAIToolCall[] }).tool_calls = [
      ...state.pendingToolCalls,
    ];
    state.pendingToolCalls.length = 0;
    state.currentAssistant = null;
  }
}

/**
 * Get text content from Responses API message content
 * @param content - Message content (string or array)
 * @returns Concatenated text content
 */
function getResponsesTextContent(
  content: string | Array<{ type: string; text?: string }>,
): string {
  if (typeof content === "string") return content;

  return content.map((c) => c.text ?? "").join("");
}

/**
 * Handle a message item in the conversion
 * @param item - Responses API message item
 * @param state - Conversion state to modify
 */
function handleMessageItem(
  item: ResponsesConversationItem & { type: "message" },
  state: ConversionState,
): void {
  flushPendingToolCalls(state);
  const content = getResponsesTextContent(item.content);

  if (item.role === "assistant") {
    state.currentAssistant = { role: "assistant", content };
    state.messages.push(state.currentAssistant);
  } else {
    state.messages.push({ role: item.role, content });
  }
}

/**
 * Handle a function_call item in the conversion
 * @param item - Responses API function_call item
 * @param state - Conversion state to modify
 */
function handleFunctionCallItem(
  item: ResponsesConversationItem & { type: "function_call" },
  state: ConversionState,
): void {
  if (!state.currentAssistant) {
    state.currentAssistant = { role: "assistant", content: "" };
    state.messages.push(state.currentAssistant);
  }

  state.pendingToolCalls.push({
    id: item.call_id,
    type: "function",
    function: { name: item.name, arguments: item.arguments },
  });
}

/**
 * Handle a function_call_output item in the conversion
 * @param item - Responses API function_call_output item
 * @param state - Conversion state to modify
 */
function handleFunctionCallOutputItem(
  item: ResponsesConversationItem & { type: "function_call_output" },
  state: ConversionState,
): void {
  flushPendingToolCalls(state);
  state.messages.push({
    role: "tool",
    tool_call_id: item.call_id,
    content: item.output,
  });
}

/**
 * Convert Responses API format to Chat Completions message format.
 * Useful for displaying Responses API history in Chat Completions-compatible UI.
 * @param items - Array of Responses API conversation items
 * @returns Array of Chat Completions messages
 */
export function responsesToChatHistory(
  items: ResponsesConversationItem[],
): OpenAIMessage[] {
  const state: ConversionState = {
    messages: [],
    currentAssistant: null,
    pendingToolCalls: [],
  };

  for (const item of items) {
    switch (item.type) {
      case "message":
        handleMessageItem(item, state);
        break;
      case "function_call":
        handleFunctionCallItem(item, state);
        break;
      case "function_call_output":
        handleFunctionCallOutputItem(item, state);
        break;
    }
  }

  flushPendingToolCalls(state);

  return state.messages;
}
