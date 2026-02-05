// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import type { FunctionResponse, Part } from "@google/genai/web";
import type {
  GeminiMessage,
  UIMessage,
  UIPart,
  UIToolPart,
} from "#webui/types/messages";

/**
 * Formats Gemini's raw chat history into a UI-friendly structure.
 *
 * Transformations applied:
 * 1. Merges consecutive model-role messages into single messages
 * 2. Integrates functionResponse messages (user-role) into the corresponding functionCall as a `result` field
 * 3. Converts raw part structures into typed parts for the UI:
 *    - `{ text }` → `{ type: "text", content }`
 *    - `{ text, thought: true }` → `{ type: "thought", content }`
 *    - `{ functionCall }` + `{ functionResponse }` → `{ type: "tool", name, args, result }`
 * 4. Marks the last thought part with `isOpen: true` for activity indicators
 * 5. Tracks `rawHistoryIndex` to map merged messages back to original indices (for retry functionality)
 *
 * @param {GeminiMessage[]} history - Raw chat history from GeminiClient
 * @returns {Array} - Formatted messages ready for UI rendering
 *
 * @example
 * // Raw history:
 * [
 *   { role: "user", parts: [{ text: "Search for docs" }] },
 *   { role: "model", parts: [{ text: "Thinking...", thought: true }] },
 *   { role: "model", parts: [{ functionCall: { name: "search", args: { query: "docs" } } }] },
 *   { role: "user", parts: [{ functionResponse: { name: "search", response: { content: [{ text: "Found docs..." }] } } }] },
 *   { role: "model", parts: [{ text: "Based on the search results..." }] }
 * ]
 *
 * // Formatted output:
 * [
 *   { role: "user", parts: [{ type: "text", content: "Search for docs" }], rawHistoryIndex: 0 },
 *   { role: "model", parts: [
 *     { type: "thought", content: "Thinking..." },
 *     { type: "tool", name: "search", args: { query: "docs" }, result: "Found docs..." },
 *     { type: "text", content: "Based on the search results..." }
 *   ], rawHistoryIndex: 1 }
 * ]
 */
export function formatGeminiMessages(history: GeminiMessage[]): UIMessage[] {
  const messages = history.reduce<UIMessage[]>(
    (acc, { role, parts = [] }, rawIndex) => {
      const lastMessage = acc.at(-1);

      // Handle error-role messages
      if (role === "error") {
        handleErrorMessage(acc, lastMessage, parts, rawIndex);

        return acc;
      }

      const currentMessage = getOrCreateMessage(
        acc,
        lastMessage,
        role,
        rawIndex,
        parts,
      );
      const currentParts: UIPart[] = currentMessage.parts;

      for (const part of parts) {
        processSinglePart(part, currentParts);
      }

      return acc;
    },
    [],
  );

  markLastThoughtAsOpen(messages);

  return messages;
}

/**
 * Handles error messages in the chat history
 * @param {UIMessage[]} acc - Accumulated messages array
 * @param {UIMessage | undefined} lastMessage - Last message in the array
 * @param {Part[]} parts - Message parts to process
 * @param {number} rawIndex - Index in the raw history
 */
function handleErrorMessage(
  acc: UIMessage[],
  lastMessage: UIMessage | undefined,
  parts: Part[],
  rawIndex: number,
): void {
  const currentMessage =
    shouldMergeErrorIntoLastMessage(lastMessage) && lastMessage
      ? lastMessage
      : createNewErrorMessage(acc, rawIndex);

  for (const part of parts) {
    if (part.text) {
      currentMessage.parts.push({
        type: "error",
        content: part.text,
        isError: true,
      });
    }
  }
}

/**
 * Determines if error should be merged into the last message
 * @param {UIMessage | undefined} lastMessage - Last message in the array
 * @returns {boolean} True if error should be merged
 */
function shouldMergeErrorIntoLastMessage(
  lastMessage: UIMessage | undefined,
): boolean {
  return lastMessage?.role === "model";
}

/**
 * Creates a new error message
 * @param {UIMessage[]} acc - Accumulated messages array
 * @param {number} rawIndex - Index in the raw history
 * @returns {UIMessage} New error message
 */
function createNewErrorMessage(acc: UIMessage[], rawIndex: number): UIMessage {
  const message: UIMessage = {
    role: "model",
    parts: [],
    rawHistoryIndex: rawIndex,
    timestamp: Date.now(),
  };

  acc.push(message);

  return message;
}

/**
 * Gets existing message or creates a new one
 * @param {UIMessage[]} acc - Accumulated messages array
 * @param {UIMessage | undefined} lastMessage - Last message in the array
 * @param {string | undefined} role - Message role
 * @param {number} rawIndex - Index in the raw history
 * @param {Part[]} parts - Message parts to process
 * @returns {UIMessage} Existing or new message
 */
function getOrCreateMessage(
  acc: UIMessage[],
  lastMessage: UIMessage | undefined,
  role: string | undefined,
  rawIndex: number,
  parts: Part[],
): UIMessage {
  const typedRole = role as "user" | "model";

  if (
    lastMessage &&
    (lastMessage.role === typedRole || isFunctionResponse(parts))
  ) {
    return lastMessage;
  }

  const message: UIMessage = {
    role: typedRole,
    parts: [],
    rawHistoryIndex: rawIndex,
    timestamp: Date.now(),
  };

  acc.push(message);

  return message;
}

/**
 * Processes a single message part
 * @param {Part} part - Part to process
 * @param {UIPart[]} currentParts - Array of UI parts to add to
 */
function processSinglePart(part: Part, currentParts: UIPart[]): void {
  const lastPart = currentParts.at(-1);
  const { functionCall, functionResponse } = part;

  if (functionCall) {
    handleFunctionCall(functionCall, currentParts);
  } else if (functionResponse) {
    handleFunctionResponse(functionResponse, currentParts);
  } else if (part.text) {
    handleTextPart(part, lastPart, currentParts);
  }
}

/**
 * Handles a function call part
 * @param {Part["functionCall"]} functionCall - Function call to handle
 * @param {UIPart[]} currentParts - Array of UI parts to add to
 */
function handleFunctionCall(
  functionCall: Part["functionCall"],
  currentParts: UIPart[],
): void {
  if (!functionCall) return;

  currentParts.push({
    type: "tool",
    name: functionCall.name ?? "",
    args: functionCall.args ?? {},
    result: null,
  });
}

/**
 * Handles a function response part
 * @param {FunctionResponse} functionResponse - Function response to handle
 * @param {UIPart[]} currentParts - Array of UI parts to update
 */
function handleFunctionResponse(
  functionResponse: FunctionResponse,
  currentParts: UIPart[],
): void {
  // Find the first tool call with matching name that doesn't have a result yet
  const toolPart = currentParts.find(
    (p): p is UIToolPart =>
      p.type === "tool" &&
      p.name === functionResponse.name &&
      p.result === null,
  );

  if (toolPart) {
    toolPart.result = getToolCallResult(functionResponse);

    if (isToolCallError(functionResponse)) {
      toolPart.isError = true;
    }
  } else {
    console.error(
      "Missing corresponding function call for function response",
      JSON.stringify({ functionResponse, currentParts }, null, 2),
    );
  }
}

/**
 * Handles a text part
 * @param {Part} part - Part containing text
 * @param {UIPart | undefined} lastPart - Last part in the array
 * @param {UIPart[]} currentParts - Array of UI parts to add to
 */
function handleTextPart(
  part: Part,
  lastPart: UIPart | undefined,
  currentParts: UIPart[],
): void {
  const text = part.text ?? "";
  const isThought = part.thought ?? false;

  const canMerge =
    lastPart &&
    lastPart.type !== "tool" &&
    lastPart.type !== "error" &&
    canMergeWithLastPart(lastPart, isThought);

  if (canMerge) {
    lastPart.content += text;
  } else {
    currentParts.push({
      type: isThought ? "thought" : "text",
      content: text,
    });
  }
}

/**
 * Determines if text can be merged with the last part
 * @param {UIPart | undefined} lastPart - Last part in the array
 * @param {boolean} isThought - Whether the current text is a thought
 * @returns {boolean} True if text can be merged
 */
function canMergeWithLastPart(
  lastPart: UIPart | undefined,
  isThought: boolean,
): boolean {
  if (!lastPart) return false;

  return (
    (lastPart.type === "text" && !isThought) ||
    (lastPart.type === "thought" && isThought)
  );
}

/**
 * Marks the last thought part as open for activity indicator
 * @param {UIMessage[]} messages - Array of UI messages
 */
function markLastThoughtAsOpen(messages: UIMessage[]): void {
  const lastPart = messages.at(-1)?.parts.at(-1);

  if (lastPart?.type === "thought") {
    lastPart.isOpen = true; // show the thought as currently active
  }
}

/**
 * Checks if parts contain a function response
 * @param {Part[]} parts - Array of parts to check
 * @returns {boolean} True if parts contain a function response
 */
function isFunctionResponse(parts: Part[]): boolean {
  return Boolean(parts[0]?.functionResponse);
}

/**
 * Extracts the result text from a function response
 * @param {FunctionResponse} functionResponse - Function response to extract from
 * @returns {string} Result text
 */
function getToolCallResult(functionResponse: FunctionResponse): string {
  // Warnings can be returned in the additional content entries,
  // but that generally isn't intended to be user-facing, so we ignore it
  const response = functionResponse.response as
    | {
        content?: Array<{ text?: string }>;
        error?: { content?: Array<{ text?: string }> };
      }
    | undefined;

  return (
    response?.content?.[0]?.text ?? response?.error?.content?.[0]?.text ?? ""
  );
}

/**
 * Checks if a function response contains an error
 * @param {FunctionResponse} functionResponse - Function response to check
 * @returns {boolean} True if response contains an error
 */
function isToolCallError(functionResponse: FunctionResponse): boolean {
  return functionResponse.response?.error != null;
}
