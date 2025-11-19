import type {
  GeminiMessage,
  OpenAIMessage,
  UIMessage,
} from "../types/messages.js";
import { formatGeminiMessages } from "../chat/gemini-formatter.js";
import { formatOpenAIMessages } from "../chat/openai-formatter.js";

/**
 * Generic streaming handler for chat messages.
 * Returns true if completed successfully, false if aborted.
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
 */
export function createGeminiErrorMessage(
  error: unknown,
  chatHistory: GeminiMessage[],
): UIMessage[] {
  console.error(error);
  let errorMessage = `${error}`;
  if (!errorMessage.startsWith("Error")) {
    errorMessage = `Error: ${errorMessage}`;
  }

  const errorEntry: GeminiMessage = {
    role: "error",
    parts: [{ text: errorMessage }],
  };

  return formatGeminiMessages([...chatHistory, errorEntry]);
}

/**
 * Creates an OpenAI error message from an exception and chat history
 */
export function createOpenAIErrorMessage(
  chatHistory: OpenAIMessage[],
  error: unknown,
): UIMessage[] {
  console.error(error);
  let errorMessage = `${error}`;
  if (!errorMessage.startsWith("Error")) {
    errorMessage = `Error: ${errorMessage}`;
  }

  const formattedHistory = formatOpenAIMessages(chatHistory);

  const errorMessage_ui: UIMessage = {
    role: "model",
    parts: [
      {
        type: "error",
        content: errorMessage,
        isError: true,
      },
    ],
    rawHistoryIndex: chatHistory.length,
  };

  return [...formattedHistory, errorMessage_ui];
}

/**
 * Validates MCP connection status and throws if there's an error.
 * Auto-retries connection if it failed.
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
