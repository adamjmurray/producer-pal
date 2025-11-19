import { useCallback, useRef, useState } from "preact/hooks";
import { GeminiClient } from "../chat/gemini-client.js";
import { formatGeminiMessages } from "../chat/gemini-formatter.js";
import type { GeminiMessage, UIMessage } from "../types/messages.js";
import {
  createGeminiErrorMessage,
  handleMessageStream,
  validateMcpConnection,
} from "./streaming-helpers.js";
import { buildGeminiConfig } from "./config-builders.js";

interface UseGeminiChatProps {
  apiKey: string;
  model: string;
  thinking: string;
  temperature: number;
  showThoughts: boolean;
  enabledTools: Record<string, boolean>;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
}

interface UseGeminiChatReturn {
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

export function useGeminiChat({
  apiKey,
  model,
  thinking,
  temperature,
  showThoughts,
  enabledTools,
  mcpStatus,
  mcpError,
  checkMcpConnection,
}: UseGeminiChatProps): UseGeminiChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [activeThinking, setActiveThinking] = useState<string | null>(null);
  const [activeTemperature, setActiveTemperature] = useState<number | null>(
    null,
  );
  const geminiRef = useRef<GeminiClient | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearConversation = useCallback(() => {
    setMessages([]);
    geminiRef.current = null;
    setActiveModel(null);
    setActiveThinking(null);
    setActiveTemperature(null);
  }, []);

  const stopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsAssistantResponding(false);
  }, []);

  const initializeChat = useCallback(
    async (chatHistory?: GeminiMessage[]) => {
      await validateMcpConnection(mcpStatus, mcpError, checkMcpConnection);
      const config = buildGeminiConfig(
        model,
        temperature,
        thinking,
        showThoughts,
        enabledTools,
        chatHistory,
      );

      geminiRef.current = new GeminiClient(apiKey, config);
      await geminiRef.current.initialize();
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
      showThoughts,
      enabledTools,
      apiKey,
    ],
  );

  const handleSend = useCallback(
    async (message: string) => {
      const userMessage = message.trim();
      if (!userMessage) return;

      if (!apiKey) {
        const userMessageEntry: GeminiMessage = {
          role: "user",
          parts: [{ text: userMessage }],
        };
        setMessages(
          createGeminiErrorMessage(
            "No API key configured. Please add your Gemini API key in Settings.",
            [userMessageEntry],
          ),
        );
        return;
      }
      setIsAssistantResponding(true);
      try {
        if (!geminiRef.current) {
          await initializeChat();
        }

        if (!geminiRef.current) {
          throw new Error("Failed to initialize Gemini client");
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const stream = geminiRef.current.sendMessage(
          userMessage,
          controller.signal,
        );

        await handleMessageStream(stream, formatGeminiMessages, setMessages);
      } catch (error) {
        setMessages(
          createGeminiErrorMessage(error, geminiRef.current?.chatHistory ?? []),
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

      if (!geminiRef.current) return;

      const rawIndex = message.rawHistoryIndex;
      const rawMessage = geminiRef.current.chatHistory[rawIndex];
      if (!rawMessage) return;

      // Extract the user message text
      const userMessage = rawMessage.parts
        ?.find((part) => part.text)
        ?.text?.trim();

      if (!userMessage) return;

      setIsAssistantResponding(true);

      try {
        // Slice history to exclude this message and everything after
        const slicedHistory = geminiRef.current.chatHistory.slice(0, rawIndex);

        await initializeChat(slicedHistory);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const stream = geminiRef.current.sendMessage(
          userMessage,
          controller.signal,
        );

        await handleMessageStream(stream, formatGeminiMessages, setMessages);
      } catch (error) {
        setMessages(
          createGeminiErrorMessage(error, geminiRef.current.chatHistory),
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
