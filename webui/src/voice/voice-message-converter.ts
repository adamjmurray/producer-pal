import type { RealtimeItem } from "@openai/agents/realtime";
import type { UIMessage, UIPart, UIToolPart } from "#webui/types/messages";

/**
 * Extracts text content from a message RealtimeItem's content array
 * @param {RealtimeItem} item - The realtime item (must be a message type)
 * @returns {string | null} The text content if found
 */
function extractTextFromItem(item: RealtimeItem): string | null {
  // Only message items have content
  if (item.type !== "message") {
    return null;
  }

  // Access content safely - it exists on message items
  const messageItem = item as {
    type: "message";
    content?: Array<{
      type: "input_text" | "output_text" | "input_audio" | "output_audio";
      text?: string;
      transcript?: string;
    }>;
  };

  if (!messageItem.content || !Array.isArray(messageItem.content)) {
    return null;
  }

  for (const contentItem of messageItem.content) {
    // Input text from user
    if (contentItem.type === "input_text" && contentItem.text) {
      return contentItem.text;
    }
    // Output text from assistant
    if (contentItem.type === "output_text" && contentItem.text) {
      return contentItem.text;
    }
    // Input audio with transcript
    if (contentItem.type === "input_audio" && contentItem.transcript) {
      return contentItem.transcript;
    }
    // Output audio with transcript
    if (contentItem.type === "output_audio" && contentItem.transcript) {
      return contentItem.transcript;
    }
  }

  return null;
}

/**
 * Converts a RealtimeItem from the voice session to a UIMessage for display
 * @param {RealtimeItem} item - The realtime item to convert
 * @param {number} index - The index in the history (used for rawHistoryIndex)
 * @returns {UIMessage | null} The converted message, or null if not displayable
 */
export function convertRealtimeItemToUIMessage(
  item: RealtimeItem,
  index: number,
): UIMessage | null {
  // Only convert message items
  if (item.type !== "message") {
    return null;
  }

  const text = extractTextFromItem(item);
  if (!text) {
    return null;
  }

  const parts: UIPart[] = [
    {
      type: "text",
      content: text,
    },
  ];

  // Determine role
  const role = item.role === "user" ? "user" : "model";

  return {
    role,
    parts,
    rawHistoryIndex: index,
  };
}

/**
 * Converts a tool call from voice session to UIToolPart
 * @param {string} name - Tool name
 * @param {Record<string, unknown>} args - Tool arguments
 * @param {string | null} result - Tool result
 * @param {boolean} isError - Whether the tool call resulted in an error
 * @returns {UIToolPart} The tool part for display
 */
export function createToolPart(
  name: string,
  args: Record<string, unknown>,
  result: string | null,
  isError = false,
): UIToolPart {
  return {
    type: "tool",
    name,
    args,
    result,
    isError,
  };
}

/**
 * Converts a history of RealtimeItems to UIMessages
 * @param {RealtimeItem[]} history - The voice session history
 * @returns {UIMessage[]} Array of UI messages for display
 */
export function convertRealtimeHistoryToUIMessages(
  history: RealtimeItem[],
): UIMessage[] {
  const messages: UIMessage[] = [];

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    if (!item) continue;
    const uiMessage = convertRealtimeItemToUIMessage(item, i);
    if (uiMessage) {
      messages.push(uiMessage);
    }
  }

  return messages;
}

/**
 * Merges voice messages with existing text chat messages
 * Voice messages are appended after the last text message
 * @param {UIMessage[]} textMessages - Existing text chat messages
 * @param {UIMessage[]} voiceMessages - Voice transcript messages
 * @returns {UIMessage[]} Combined messages array
 */
export function mergeTextAndVoiceMessages(
  textMessages: UIMessage[],
  voiceMessages: UIMessage[],
): UIMessage[] {
  // Voice messages get indices starting after text messages
  const offsetMessages = voiceMessages.map((msg, i) => ({
    ...msg,
    rawHistoryIndex: textMessages.length + i,
  }));

  return [...textMessages, ...offsetMessages];
}
