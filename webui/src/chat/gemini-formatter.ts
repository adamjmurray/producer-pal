import type { FunctionResponse, Part } from "@google/genai/web";
import type {
  GeminiMessage,
  UIMessage,
  UIPart,
  UIToolPart,
} from "../types/messages.js";

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
 * @param history - Raw chat history from GeminiClient
 * @returns Formatted messages ready for UI rendering
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
    (messages, { role, parts = [] }, rawIndex) => {
      const lastMessage = messages.at(-1);
      let currentMessage: UIMessage;

      // Handle error-role messages
      if (role === "error") {
        // Check if last message is a model message
        if (lastMessage?.role === "model") {
          // Merge error into existing model message
          currentMessage = lastMessage;
        } else {
          // Create new model message for the error
          currentMessage = {
            role: "model",
            parts: [],
            rawHistoryIndex: rawIndex,
          };
          messages.push(currentMessage);
        }

        // Add error parts
        for (const part of parts) {
          if (part.text) {
            currentMessage.parts.push({
              type: "error",
              content: part.text,
              isError: true,
            });
          }
        }

        return messages;
      }

      if (lastMessage?.role === role || isFunctionResponse(parts)) {
        currentMessage = lastMessage;
      } else {
        currentMessage = {
          role: role as "user" | "model",
          parts: [],
          rawHistoryIndex: rawIndex,
        };
        messages.push(currentMessage);
      }
      const currentParts: UIPart[] = currentMessage.parts;

      for (const part of parts) {
        const lastPart = currentParts.at(-1);
        const { functionCall, functionResponse } = part;

        if (functionCall) {
          currentParts.push({
            type: "tool",
            name: functionCall.name,
            args: functionCall.args,
            result: null,
          });
        } else if (functionResponse) {
          // Find the first tool call with matching name that doesn't have a result yet
          const toolPart = currentParts.find(
            (part): part is UIToolPart =>
              part.type === "tool" &&
              part.name === functionResponse.name &&
              part.result === null,
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
        } else if (part.text) {
          if (
            (lastPart?.type === "text" && !part.thought) ||
            (lastPart?.type === "thought" && part.thought)
          ) {
            lastPart.content += part.text;
          } else {
            currentParts.push({
              type: part.thought ? "thought" : "text",
              content: part.text,
            });
          }
        }
      }

      return messages;
    },
    [],
  );

  const lastPart = messages.at(-1)?.parts?.at(-1);
  if (lastPart?.type === "thought") {
    lastPart.isOpen = true; // show the thought as currently active
  }

  return messages;
}

function isFunctionResponse(parts: Part[]): boolean {
  return !!parts?.[0]?.functionResponse;
}

function getToolCallResult(functionResponse: FunctionResponse): string {
  // Warnings can be returned in the additional content entries,
  // but that generally isn't intended to be user-facing, so we ignore it
  const response = functionResponse.response as any;
  return (
    response?.content?.[0]?.text ?? response?.error?.content?.[0]?.text ?? ""
  );
}

function isToolCallError(functionResponse: FunctionResponse): boolean {
  return functionResponse.response?.error != null;
}
