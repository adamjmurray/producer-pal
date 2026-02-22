// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatGeminiMessages } from "#webui/chat/gemini/formatter";
import { normalizeErrorMessage } from "#webui/lib/error-formatters";
import { type GeminiMessage, type UIMessage } from "#webui/types/messages";

/**
 * Generic streaming handler for chat messages.
 * Returns true if completed successfully, false if aborted.
 * @param {AsyncIterable<TMessage[]>} stream - Stream of message arrays
 * @param {(history: TMessage[]) => UIMessage[]} formatter - Function to format messages
 * @param {(messages: UIMessage[]) => void} onUpdate - Callback for message updates
 * @returns {any} - Hook return value
 */
export async function handleMessageStream<TMessage>(
  stream: AsyncIterable<TMessage[]>,
  formatter: (history: TMessage[]) => UIMessage[],
  onUpdate: (messages: UIMessage[]) => void,
): Promise<boolean> {
  try {
    for await (const chatHistory of stream) {
      onUpdate(formatter(chatHistory));
    }

    return true;
  } catch (error) {
    // Abort errors are expected when user cancels - don't treat as error
    if (error instanceof Error && error.name === "AbortError") {
      return false;
    }

    throw error;
  }
}

/**
 * Creates a Gemini error message from an exception and chat history
 * @param {unknown} error - Error object or message
 * @param {GeminiMessage[]} chatHistory - Current chat history
 * @returns {any} - Hook return value
 */
export function createGeminiErrorMessage(
  error: unknown,
  chatHistory: GeminiMessage[],
): UIMessage[] {
  const errorMessage = normalizeErrorMessage(error);

  const errorEntry: GeminiMessage = {
    role: "error",
    parts: [{ text: errorMessage }],
  };

  return formatGeminiMessages([...chatHistory, errorEntry]);
}

/**
 * Creates an error message by formatting chat history and appending an error entry
 * @param history - Raw chat history for any provider
 * @param formatter - Provider-specific formatter to convert raw history to UIMessages
 * @param error - Error object or message
 * @returns Formatted messages with error appended
 */
export function createFormattedErrorMessage<T>(
  history: T[],
  formatter: (messages: T[]) => UIMessage[],
  error: unknown,
): UIMessage[] {
  const errorMessage = normalizeErrorMessage(error);
  const formattedHistory = formatter(history);

  const errorMessage_ui: UIMessage = {
    role: "model",
    parts: [
      {
        type: "error",
        content: errorMessage,
        isError: true,
      },
    ],
    rawHistoryIndex: history.length,
    timestamp: Date.now(),
  };

  return [...formattedHistory, errorMessage_ui];
}

/**
 * Validates MCP connection status and throws if there's an error.
 * Auto-retries connection if it failed.
 * @param {"connected" | "connecting" | "error"} mcpStatus - MCP connection status
 * @param {string | null} mcpError - MCP error message if any
 * @param {() => Promise<void>} checkMcpConnection - Callback to retry connection
 * @returns {any} - Hook return value
 */
export async function validateMcpConnection(
  mcpStatus: "connected" | "connecting" | "error",
  mcpError: string | null,
  checkMcpConnection: () => Promise<void>,
): Promise<void> {
  if (mcpStatus === "error") {
    await checkMcpConnection();
    throw new Error(`MCP connection failed: ${mcpError}`);
  }
}
