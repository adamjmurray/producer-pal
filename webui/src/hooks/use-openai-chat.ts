import { useCallback, useRef, useState } from "preact/hooks";
import { OpenAIClient } from "../chat/openai-client.js";
import { formatOpenAIMessages } from "../chat/openai-formatter.js";
import type { OpenAIMessage, UIMessage } from "../types/messages.js";
import { buildOpenAIConfig } from "./config-builders.js";
import {
  createOpenAIErrorMessage,
  handleMessageStream,
  validateMcpConnection,
} from "./streaming-helpers.js";

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
 *
 * @param root0
 * @param root0.apiKey
 * @param root0.model
 * @param root0.thinking
 * @param root0.temperature
 * @param root0.baseUrl
 * @param root0.enabledTools
 * @param root0.mcpStatus
 * @param root0.mcpError
 * @param root0.checkMcpConnection
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
