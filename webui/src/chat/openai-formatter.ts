import type { ReasoningDetail } from "#webui/chat/openai-client";
import type {
  OpenAIMessage,
  OpenAIToolCall,
  UIMessage,
  UIPart,
} from "#webui/types/messages";

/**
 * Add reasoning details to parts array
 * @param {ReasoningDetail[] | undefined} reasoningDetails - Array of reasoning details from the API response
 * @param {UIPart[]} parts - Parts array to add reasoning thoughts to
 */
function addReasoningDetails(
  reasoningDetails: ReasoningDetail[] | undefined,
  parts: UIPart[],
): void {
  if (!reasoningDetails || reasoningDetails.length === 0) return;

  // Extract all reasoning text
  const reasoningText = reasoningDetails
    .filter((detail) => detail.type === "reasoning.text" && detail.text)
    .map((detail) => detail.text)
    .join("");

  if (!reasoningText) return;

  const lastPart = parts.at(-1);

  if (lastPart?.type === "thought") {
    // Merge with previous thought part
    lastPart.content += reasoningText;
  } else {
    parts.push({ type: "thought", content: reasoningText });
  }
}

/**
 * Find matching tool result in history
 * @param {OpenAIMessage[]} history - Chat history to search
 * @param {string} toolCallId - Tool call ID to find result for
 * @param {number} startIndex - Index to start searching from
 * @returns {{ result: string | null; isError: boolean }} - Tool result and error flag
 */
function findToolResult(
  history: OpenAIMessage[],
  toolCallId: string,
  startIndex: number,
): { result: string | null; isError: boolean } {
  for (let i = startIndex; i < history.length; i++) {
    const nextMsg = history[i];

    if (!nextMsg) continue;

    if (
      nextMsg.role === "tool" &&
      "tool_call_id" in nextMsg &&
      nextMsg.tool_call_id === toolCallId
    ) {
      const toolContent =
        typeof nextMsg.content === "string" ? nextMsg.content : undefined;
      const result = toolContent ?? "";

      // Basic heuristic: check if content contains error indicators
      const isError =
        result.includes('"error"') || result.includes('"isError":true');

      return { result, isError };
    }
  }

  return { result: null, isError: false };
}

/**
 * Process text content and add to parts, merging with previous text part if needed
 * @param {UIPart[]} parts - Parts array to add text to
 * @param {string} content - Text content to add
 */
function addTextContent(parts: UIPart[], content: string): void {
  const lastPart = parts.at(-1);

  if (lastPart?.type === "text") {
    lastPart.content += content;
  } else {
    parts.push({ type: "text", content });
  }
}

/**
 * Process a single tool call and add it to parts
 * @param {OpenAIToolCall} toolCall - Tool call to process
 * @param {UIPart[]} parts - Parts array to add tool call to
 * @param {OpenAIMessage[]} history - Chat history to search for tool results
 * @param {number} rawIndex - Index in history to start searching from
 */
function addToolCall(
  toolCall: OpenAIToolCall,
  parts: UIPart[],
  history: OpenAIMessage[],
  rawIndex: number,
): void {
  if (toolCall.type !== "function") return;

  const args = toolCall.function.arguments
    ? JSON.parse(toolCall.function.arguments)
    : {};

  const { result, isError } = findToolResult(
    history,
    toolCall.id,
    rawIndex + 1,
  );

  parts.push({
    type: "tool",
    name: toolCall.function.name,
    args,
    result,
    isError: isError ? true : undefined,
  });
}

/**
 * Process all tool calls for a message
 * @param {OpenAIMessage} msg - Message to process tool calls from
 * @param {UIPart[]} parts - Parts array to add tool calls to
 * @param {OpenAIMessage[]} history - Chat history for tool result lookup
 * @param {number} rawIndex - Index in history for tool result lookup
 */
function processToolCalls(
  msg: OpenAIMessage,
  parts: UIPart[],
  history: OpenAIMessage[],
  rawIndex: number,
): void {
  if (msg.role !== "assistant" || !("tool_calls" in msg) || !msg.tool_calls) {
    return;
  }

  for (const toolCall of msg.tool_calls) {
    addToolCall(toolCall, parts, history, rawIndex);
  }
}

/**
 * Process user or assistant message content (text and tool calls)
 * @param {OpenAIMessage} msg - Message to process
 * @param {UIPart[]} parts - Parts array to add content to
 * @param {OpenAIMessage[]} history - Chat history for tool result lookup
 * @param {number} rawIndex - Index in history for tool result lookup
 */
function processMessageContent(
  msg: OpenAIMessage,
  parts: UIPart[],
  history: OpenAIMessage[],
  rawIndex: number,
): void {
  if (msg.role !== "user" && msg.role !== "assistant") {
    return;
  }

  // Add reasoning content (assistant only)
  if (msg.role === "assistant" && "reasoning_details" in msg) {
    const reasoningDetails = msg.reasoning_details as
      | ReasoningDetail[]
      | undefined;

    addReasoningDetails(reasoningDetails, parts);
  }

  // Add text content
  const content = typeof msg.content === "string" ? msg.content : undefined;

  if (content) {
    addTextContent(parts, content);
  }

  // Add tool calls
  processToolCalls(msg, parts, history, rawIndex);
}

/**
 * Mark the last thought part as open if it exists
 * @param {UIMessage[]} messages - Array of UI messages
 */
function markLastThoughtAsOpen(messages: UIMessage[]): void {
  const lastMessage = messages.at(-1);

  if (!lastMessage) return;

  const lastPart = lastMessage.parts.at(-1);

  if (lastPart?.type === "thought") {
    lastPart.isOpen = true;
  }
}

/**
 * Formats OpenAI's raw chat history into a UI-friendly structure.
 *
 * Transformations applied:
 * 1. Filters system messages (internal configuration)
 * 2. Skips tool messages (merged into assistant messages)
 * 3. Merges consecutive assistant messages into single messages
 * 4. Integrates tool results by matching tool_call_id
 * 5. Converts raw message structures into typed parts for the UI:
 *    - User/assistant `content` → `{ type: "text", content }`
 *    - Assistant `reasoning_details` → `{ type: "thought", content }` (collapsible thinking)
 *    - Assistant `tool_calls` → `{ type: "tool", name, args, result }` (result from matching tool message)
 * 6. Marks the last thought part with `isOpen: true` for activity indicators
 * 7. Tracks `rawHistoryIndex` to map merged messages back to original indices (for retry functionality)
 *
 * @param {OpenAIMessage[]} history - Raw chat history from OpenAIClient
 * @returns {UIMessage[]} Formatted messages ready for UI rendering
 *
 * @example
 * // Raw history:
 * [
 *   { role: "system", content: "System prompt" },
 *   { role: "user", content: "Search for docs" },
 *   { role: "assistant", content: "", reasoning_details: [{ type: "reasoning.text", text: "Thinking...", index: 0 }], tool_calls: [{ id: "call_123", function: { name: "search", arguments: '{"query":"docs"}' } }] },
 *   { role: "tool", tool_call_id: "call_123", content: '{"text":"Found docs..."}' },
 *   { role: "assistant", content: "Based on the search results..." }
 * ]
 *
 * // Formatted output:
 * [
 *   { role: "user", parts: [{ type: "text", content: "Search for docs" }], rawHistoryIndex: 1 },
 *   { role: "model", parts: [
 *     { type: "thought", content: "Thinking..." },
 *     { type: "tool", name: "search", args: { query: "docs" }, result: '{"text":"Found docs..."}' },
 *     { type: "text", content: "Based on the search results..." }
 *   ], rawHistoryIndex: 2 }
 * ]
 */
export function formatOpenAIMessages(history: OpenAIMessage[]): UIMessage[] {
  const messages: UIMessage[] = [];

  for (let rawIndex = 0; rawIndex < history.length; rawIndex++) {
    const msg = history[rawIndex];

    if (!msg) continue;

    // Skip system messages (internal)
    if (msg.role === "system") continue;

    // Skip tool messages (they're merged into assistant messages)
    if (msg.role === "tool") continue;

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

    // Process message content (text, reasoning, tool calls)
    processMessageContent(msg, currentMessage.parts, history, rawIndex);
  }

  // Mark the last thought part as open (similar to Gemini's implementation)
  markLastThoughtAsOpen(messages);

  return messages;
}
