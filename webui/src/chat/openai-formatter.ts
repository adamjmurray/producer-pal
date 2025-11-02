import type { OpenAIMessage, UIMessage, UIPart } from "../types/messages.js";

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
 *    - Assistant `tool_calls` → `{ type: "tool", name, args, result }` (result from matching tool message)
 * 6. Tracks `rawHistoryIndex` to map merged messages back to original indices (for retry functionality)
 *
 * @param history - Raw chat history from OpenAIClient
 * @returns Formatted messages ready for UI rendering
 *
 * @example
 * // Raw history:
 * [
 *   { role: "system", content: "System prompt" },
 *   { role: "user", content: "Search for docs" },
 *   { role: "assistant", content: "", tool_calls: [{ id: "call_123", function: { name: "search", arguments: '{"query":"docs"}' } }] },
 *   { role: "tool", tool_call_id: "call_123", content: '{"text":"Found docs..."}' },
 *   { role: "assistant", content: "Based on the search results..." }
 * ]
 *
 * // Formatted output:
 * [
 *   { role: "user", parts: [{ type: "text", content: "Search for docs" }], rawHistoryIndex: 1 },
 *   { role: "model", parts: [
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
        for (const tc of msg.tool_calls) {
          // Only handle function tool calls (skip custom tool calls)
          if (tc.type !== "function") continue;

          const args = JSON.parse(tc.function.arguments);

          // Look ahead for matching tool result
          let result: string | null = null;
          let isError = false;

          for (let i = rawIndex + 1; i < history.length; i++) {
            const nextMsg = history[i];
            if (!nextMsg) continue;
            if (
              nextMsg.role === "tool" &&
              "tool_call_id" in nextMsg &&
              nextMsg.tool_call_id === tc.id
            ) {
              const toolContent =
                typeof nextMsg.content === "string"
                  ? nextMsg.content
                  : undefined;
              result = toolContent ?? "";
              // Basic heuristic: check if content contains error indicators
              if (result) {
                isError =
                  result.includes('"error"') ||
                  result.includes('"isError":true');
              }
              break;
            }
          }

          parts.push({
            type: "tool",
            name: tc.function.name,
            args,
            result,
            isError: isError ? true : undefined,
          });
        }
      }
    }
  }

  return messages;
}
