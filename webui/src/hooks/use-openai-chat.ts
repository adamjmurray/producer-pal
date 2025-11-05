import { useCallback, useRef, useState } from "preact/hooks";
import {
  OpenAIClient,
  type OpenAIClientConfig,
} from "../chat/openai-client.js";
import { formatOpenAIMessages } from "../chat/openai-formatter.js";
import { SYSTEM_INSTRUCTION } from "../config.js";
import type { OpenAIMessage, UIMessage } from "../types/messages.js";

function historyWithError(
  chatHistory: OpenAIMessage[],
  error: unknown,
): UIMessage[] {
  console.error(error);
  let errorMessage = `${error}`;
  if (!errorMessage.startsWith("Error")) {
    errorMessage = `Error: ${errorMessage}`;
  }

  // Format existing chat history as UI messages, then append error message
  const formattedHistory = formatOpenAIMessages(chatHistory);

  // Create error message with proper error part (not text part)
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

interface UseOpenAIChatProps {
  apiKey: string;
  model: string;
  thinking: string; // Will be mapped to reasoningEffort
  temperature: number;
  baseUrl?: string;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
}

interface UseOpenAIChatReturn {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  activeModel: string | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  handleSend: (message: string) => Promise<void>;
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  clearConversation: () => void;
}

/**
 * Check if we're using the actual OpenAI API (not OpenAI-compatible providers like Groq/Mistral).
 * reasoning_effort is only supported by OpenAI's API.
 */
function isOpenAIProvider(baseUrl?: string): boolean {
  // If no baseUrl, OpenAIClient defaults to OpenAI
  if (!baseUrl) return true;
  // Check if it's the OpenAI API URL
  return baseUrl === "https://api.openai.com/v1";
}

/**
 * Maps Gemini thinking setting to OpenAI reasoning_effort parameter.
 * Note: Most OpenAI models don't support reasoning_effort (only o1/o3 series).
 */
function mapThinkingToReasoningEffort(
  thinking: string,
): "low" | "medium" | "high" | undefined {
  switch (thinking) {
    case "Low":
      return "low";
    case "High":
    case "Ultra":
      return "high";
    case "Auto":
    case "Medium":
      return "medium";
    default:
      // "Off" or specific budgets - OpenAI doesn't support granular control
      return undefined;
  }
}

export function useOpenAIChat({
  apiKey,
  model,
  thinking,
  temperature,
  baseUrl,
  mcpStatus,
  mcpError,
  checkMcpConnection,
}: UseOpenAIChatProps): UseOpenAIChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [activeThinking, setActiveThinking] = useState<string | null>(null);
  const [activeTemperature, setActiveTemperature] = useState<number | null>(
    null,
  );
  const openaiRef = useRef<OpenAIClient | null>(null);

  const clearConversation = useCallback(() => {
    setMessages([]);
    openaiRef.current = null;
    setActiveModel(null);
    setActiveThinking(null);
    setActiveTemperature(null);
  }, []);

  const initializeChat = useCallback(
    async (chatHistory?: OpenAIMessage[]) => {
      // Auto-retry MCP connection if it failed
      if (mcpStatus === "error") {
        await checkMcpConnection();
        // Note: mcpStatus is a prop and won't update within this function
        // The parent needs to re-render for status changes to be reflected
        throw new Error(`MCP connection failed: ${mcpError}`);
      }

      const config: OpenAIClientConfig = {
        model,
        temperature,
        systemInstruction: SYSTEM_INSTRUCTION,
        baseUrl,
      };

      if (chatHistory) {
        config.chatHistory = chatHistory;
      }

      // Only include reasoning_effort when using actual OpenAI API (not Groq/Mistral/etc)
      if (isOpenAIProvider(baseUrl)) {
        const reasoningEffort = mapThinkingToReasoningEffort(thinking);
        if (reasoningEffort) {
          config.reasoningEffort = reasoningEffort;
        }
      }

      openaiRef.current = new OpenAIClient(apiKey, config);
      await openaiRef.current.initialize();
      setActiveModel(model);
      setActiveThinking(thinking);
      setActiveTemperature(temperature);
    },
    [
      mcpStatus,
      checkMcpConnection,
      mcpError,
      thinking,
      model,
      temperature,
      baseUrl,
      apiKey,
    ],
  );

  const handleSend = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      const userMessage = message.trim();

      if (!apiKey) {
        const userMessageEntry: OpenAIMessage = {
          role: "user",
          content: userMessage,
        };
        setMessages(
          historyWithError(
            [userMessageEntry],
            "No API key configured. Please add your API key in Settings.",
          ),
        );
        return;
      }
      setIsAssistantResponding(true);

      try {
        if (!openaiRef.current) {
          await initializeChat();
        }

        if (!openaiRef.current) {
          throw new Error("Failed to initialize OpenAI client");
        }

        const stream = openaiRef.current.sendMessage(userMessage);

        for await (const chatHistory of stream) {
          // console.log(
          //   "useOpenAIChat() received chunk, now history is",
          //   JSON.stringify(chatHistory, null, 2),
          // );
          setMessages(formatOpenAIMessages(chatHistory));
        }
      } catch (error) {
        setMessages(
          historyWithError(openaiRef.current?.chatHistory ?? [], error),
        );
      } finally {
        setIsAssistantResponding(false);
      }
    },
    [apiKey, initializeChat],
  );

  const handleRetry = useCallback(
    async (mergedMessageIndex: number) => {
      if (!apiKey) return;

      const message = messages[mergedMessageIndex];
      if (message?.role !== "user") return;

      if (!openaiRef.current) return;

      const rawIndex = message.rawHistoryIndex;
      const rawMessage = openaiRef.current.chatHistory[rawIndex];
      if (!rawMessage) return;

      // Extract the user message text
      const userMessage =
        rawMessage.role === "user" && typeof rawMessage.content === "string"
          ? rawMessage.content.trim()
          : undefined;

      if (!userMessage) return;

      setIsAssistantResponding(true);

      try {
        // Slice history to exclude this message and everything after
        const slicedHistory = openaiRef.current.chatHistory.slice(0, rawIndex);

        await initializeChat(slicedHistory);

        const stream = openaiRef.current.sendMessage(userMessage);

        for await (const chatHistory of stream) {
          setMessages(formatOpenAIMessages(chatHistory));
        }
      } catch (error) {
        setMessages(historyWithError(openaiRef.current.chatHistory, error));
      } finally {
        setIsAssistantResponding(false);
      }
    },
    [apiKey, messages, initializeChat],
  );

  return {
    messages,
    isAssistantResponding,
    activeModel,
    activeThinking,
    activeTemperature,
    handleSend,
    handleRetry,
    clearConversation,
  };
}
