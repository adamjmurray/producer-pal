// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Formatter for OpenAI Responses API conversation items.
 * Converts Responses API format to UI-friendly UIMessage format.
 */
import { markLastThoughtAsOpen } from "#webui/chat/helpers/formatter-helpers";
import type { UIMessage, UIPart } from "#webui/types/messages";
import type {
  ResponsesConversationItem,
  ResponsesFunctionCallItem,
  ResponsesOutputItem,
} from "#webui/types/responses-api";
import { extractReasoningText } from "./responses-streaming";

/**
 * Find matching function_call_output for a function_call item
 * @param conversation - Conversation to search
 * @param callId - Call ID to match
 * @param startIndex - Index to start searching from
 * @returns Tool result and error flag
 */
function findToolResult(
  conversation: ResponsesConversationItem[],
  callId: string,
  startIndex: number,
): { result: string | null; isError: boolean } {
  for (let i = startIndex; i < conversation.length; i++) {
    const item = conversation[i];

    if (!item) continue;
    if (item.type !== "function_call_output") continue;
    if (item.call_id !== callId) continue;

    const result = item.output;
    const errorIndicators = ['"error"', '"isError":true'];
    const isError = errorIndicators.some((indicator) =>
      result.includes(indicator),
    );

    return { result, isError };
  }

  return { result: null, isError: false };
}

/**
 * Process a function_call item into a UIToolPart
 * @param item - Function call item to process
 * @param conversation - Full conversation for finding results
 * @param index - Index of item in conversation
 * @returns UI tool part
 */
function processToolCall(
  item: ResponsesFunctionCallItem,
  conversation: ResponsesConversationItem[],
  index: number,
): UIPart {
  const args = item.arguments ? JSON.parse(item.arguments) : {};
  const { result, isError } = findToolResult(
    conversation,
    item.call_id,
    index + 1,
  );

  return {
    type: "tool",
    name: item.name,
    args,
    result,
    isError: isError ? true : undefined,
  };
}

/**
 * Extract text content from message item
 * @param content - Message content (string or array)
 * @returns Extracted text content
 */
function extractMessageText(
  content: string | Array<{ type: string; text?: string }>,
): string {
  if (typeof content === "string") return content;

  return content
    .filter((part) => part.type === "output_text" || part.type === "input_text")
    .map((part) => part.text ?? "")
    .join("");
}

/**
 * Add text content to parts, merging with previous text part if needed
 * @param parts - Parts array to modify
 * @param content - Text content to add
 */
function addTextContent(parts: UIPart[], content: string): void {
  if (!content) return;
  const lastPart = parts.at(-1);

  if (lastPart?.type === "text") {
    lastPart.content += content;
  } else {
    parts.push({ type: "text", content });
  }
}

/**
 * Check if item is a reasoning item
 * @param item - Conversation item to check
 * @returns True if reasoning item
 */
function isReasoningItem(item: ResponsesConversationItem): boolean {
  return (item as { type: string }).type === "reasoning";
}

/**
 * Check if item should be grouped with assistant messages
 * @param item - Item to check
 * @returns True if assistant-type item
 */
function isAssistantItem(item: ResponsesConversationItem): boolean {
  return (
    item.type === "function_call" ||
    isReasoningItem(item) ||
    (item.type === "message" && item.role === "assistant")
  );
}

/**
 * Process a single conversation item and add parts to the current message
 * @param item - Item to process
 * @param currentMessage - Message to add parts to
 * @param conversation - Full conversation for context
 * @param index - Index of item in conversation
 */
function processItem(
  item: ResponsesConversationItem,
  currentMessage: UIMessage,
  conversation: ResponsesConversationItem[],
  index: number,
): void {
  if (item.type === "message") {
    addTextContent(currentMessage.parts, extractMessageText(item.content));
  } else if (item.type === "function_call") {
    currentMessage.parts.push(processToolCall(item, conversation, index));
  } else if (isReasoningItem(item)) {
    const text = extractReasoningText(item as unknown as ResponsesOutputItem);

    if (text) {
      currentMessage.parts.push({ type: "thought", content: text });
    }
  }
}

/**
 * Formats Responses API conversation items into a UI-friendly structure.
 *
 * Transformations applied:
 * 1. Filters system messages (internal configuration)
 * 2. Skips function_call_output items (merged into assistant tool parts)
 * 3. Merges consecutive assistant items into single messages
 * 4. Integrates tool results by matching call_id
 * 5. Converts items into typed parts for the UI
 * 6. Marks the last thought part with isOpen: true for activity indicators
 * @param conversation - Array of Responses API conversation items
 * @returns Formatted messages ready for UI rendering
 */
export function formatResponsesMessages(
  conversation: ResponsesConversationItem[],
): UIMessage[] {
  const messages: UIMessage[] = [];

  for (let index = 0; index < conversation.length; index++) {
    const item = conversation[index];

    if (!item) continue;

    // Skip system messages and function_call_output (merged into tool parts)
    if (item.type === "message" && item.role === "system") continue;
    if (item.type === "function_call_output") continue;

    const lastMessage = messages.at(-1);
    const isAssistant = isAssistantItem(item);

    // Merge consecutive assistant items into the same message
    const shouldMerge = lastMessage?.role === "model" && isAssistant;

    const currentMessage = shouldMerge
      ? lastMessage
      : createNewMessage(isAssistant, index, messages);

    processItem(item, currentMessage, conversation, index);
  }

  markLastThoughtAsOpen(messages);

  return messages;
}

/**
 * Create a new UIMessage and add it to the messages array
 * @param isAssistant - Whether this is an assistant message
 * @param index - Raw history index
 * @param messages - Messages array to append to
 * @returns The newly created message
 */
function createNewMessage(
  isAssistant: boolean,
  index: number,
  messages: UIMessage[],
): UIMessage {
  const message: UIMessage = {
    role: isAssistant ? "model" : "user",
    parts: [],
    rawHistoryIndex: index,
    timestamp: Date.now(),
  };

  messages.push(message);

  return message;
}
