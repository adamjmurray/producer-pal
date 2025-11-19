import type {
  OpenAIMessage,
  UIMessage,
  UIPart,
  UIThoughtPart,
} from "../types/messages.js";
import type { ReasoningDetail } from "./openai-client.js";

/**
 * Add reasoning details to parts array
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
 * @param history - Raw chat history from OpenAIClient
 * @returns Formatted messages ready for UI rendering
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
      };
      messages.push(currentMessage);
    }

    const parts: UIPart[] = currentMessage.parts;

    if (msg.role === "user" || msg.role === "assistant") {
      // Add reasoning content (assistant only) - this comes before regular content
      if (msg.role === "assistant" && "reasoning_details" in msg) {
        const reasoningDetails = msg.reasoning_details as
          | ReasoningDetail[]
          | undefined;
        addReasoningDetails(reasoningDetails, parts);
      }

      // Add text content (handle both string and array content types)
      const content = typeof msg.content === "string" ? msg.content : undefined;
      if (content) {
        const lastPart = parts.at(-1);
        if (lastPart?.type === "text") {
          // Merge with previous text part
          lastPart.content += content;
        } else {
          parts.push({ type: "text", content });
        }
      }

      // Add tool calls (assistant only)
      if (msg.role === "assistant" && "tool_calls" in msg && msg.tool_calls) {
        for (const toolCall of msg.tool_calls) {
          // Only handle function tool calls (skip custom tool calls)
          if (toolCall.type !== "function") continue;

          const args = toolCall.function.arguments
            ? JSON.parse(toolCall.function.arguments)
            : {};

          // Look ahead for matching tool result
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
      }
    }
  }

  // Mark the last thought part as open (similar to Gemini's implementation)
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    const lastPart = lastMessage.parts.at(-1);
    if (lastPart?.type === "thought") {
      (lastPart as UIThoughtPart).isOpen = true; // show the thought as currently active
    }
  }

  return messages;
}
