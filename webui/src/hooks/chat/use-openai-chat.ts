import { useCallback, useRef, useState } from "preact/hooks";
import { OpenAIClient } from "../../chat/openai-client";
import { formatOpenAIMessages } from "../../chat/openai-formatter";
import type { OpenAIMessage, UIMessage } from "../../types/messages";
import { buildOpenAIConfig } from "./config-builders";
import {
  createOpenAIErrorMessage,
  handleMessageStream,
  validateMcpConnection,
} from "./streaming-helpers";

interface UseOpenAIChatProps {
  apiKey: string;
  model: string;
  thinking: string; // Will be mapped to reasoningEffort
  temperature: number;
  baseUrl?: string;
  enabledTools: Record<string, boolean>;
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
  stopResponse: () => void;
}

// Hook orchestrates multiple pieces of state and callbacks for chat functionality

/**
 * Hook for managing OpenAI chat state and message handling
 *
 * @param {UseOpenAIChatProps} root0 - Chat configuration
 * @param {string} root0.apiKey - OpenAI API key
 * @param {string} root0.model - OpenAI model name
 * @param {string} root0.thinking - Reasoning effort level
 * @param {number} root0.temperature - Temperature for response randomness
 * @param {string} [root0.baseUrl] - Custom base URL for OpenAI-compatible APIs
 * @param {Record<string, boolean>} root0.enabledTools - Map of enabled MCP tools
 * @param {"connected" | "connecting" | "error"} root0.mcpStatus - MCP connection status
 * @param {string | null} root0.mcpError - MCP connection error if any
 * @param {() => Promise<void>} root0.checkMcpConnection - Function to verify MCP connection
 * @returns {UseOpenAIChatReturn} Chat state and handlers
 */
// eslint-disable-next-line max-lines-per-function
export function useOpenAIChat({
  apiKey,
  model,
  thinking,
  temperature,
  baseUrl,
  enabledTools,
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
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearConversation = useCallback(() => {
    setMessages([]);
    openaiRef.current = null;
    setActiveModel(null);
    setActiveThinking(null);
    setActiveTemperature(null);
  }, []);

  const stopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsAssistantResponding(false);
  }, []);

  const initializeChat = useCallback(
    async (chatHistory?: OpenAIMessage[]) => {
      await validateMcpConnection(mcpStatus, mcpError, checkMcpConnection);
      const config = buildOpenAIConfig(
        model,
        temperature,
        thinking,
        baseUrl,
        enabledTools,
        chatHistory,
      );

      openaiRef.current = new OpenAIClient(apiKey, config);
      await openaiRef.current.initialize();
      setActiveModel(model);
      setActiveThinking(thinking);
      setActiveTemperature(temperature);
    },
    [
      mcpStatus,
      mcpError,
      checkMcpConnection,
      model,
      temperature,
      thinking,
      baseUrl,
      enabledTools,
      apiKey,
    ],
  );

  const handleSend = useCallback(
    async (message: string) => {
      const userMessage = message.trim();
      if (!userMessage) return;

      if (!apiKey) {
        const userMessageEntry: OpenAIMessage = {
          role: "user",
          content: userMessage,
        };
        setMessages(
          createOpenAIErrorMessage(
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

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const stream = openaiRef.current.sendMessage(
          userMessage,
          controller.signal,
        );

        await handleMessageStream(stream, formatOpenAIMessages, setMessages);
      } catch (error) {
        setMessages(
          createOpenAIErrorMessage(openaiRef.current?.chatHistory ?? [], error),
        );
      } finally {
        abortControllerRef.current = null;
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

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const stream = openaiRef.current.sendMessage(
          userMessage,
          controller.signal,
        );

        await handleMessageStream(stream, formatOpenAIMessages, setMessages);
      } catch (error) {
        setMessages(
          createOpenAIErrorMessage(openaiRef.current.chatHistory, error),
        );
      } finally {
        abortControllerRef.current = null;
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
    stopResponse,
  };
}
