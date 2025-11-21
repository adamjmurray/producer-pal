import { useCallback, useRef, useState } from "preact/hooks";
import type { UIMessage } from "../../types/messages";
import {
  handleMessageStream,
  validateMcpConnection,
} from "./streaming-helpers";

/**
 * Chat client interface that all providers must implement
 */
export interface ChatClient<TMessage> {
  chatHistory: TMessage[];
  initialize(): Promise<void>;
  sendMessage(message: string, signal: AbortSignal): AsyncIterable<TMessage[]>;
}

/**
 * Provider-specific adapter interface
 */
export interface ChatAdapter<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  /**
   * Create a new client instance
   */
  createClient(apiKey: string, config: TConfig): TClient;

  /**
   * Build provider-specific configuration
   */
  buildConfig(
    model: string,
    temperature: number,
    thinking: string,
    enabledTools: Record<string, boolean>,
    chatHistory: TMessage[] | undefined,
    extraParams?: Record<string, unknown>,
  ): TConfig;

  /**
   * Format messages for UI display
   */
  formatMessages(messages: TMessage[]): UIMessage[];

  /**
   * Create error message in provider's format
   */
  createErrorMessage(error: unknown, chatHistory: TMessage[]): UIMessage[];

  /**
   * Extract user message text from a message for retry
   */
  extractUserMessage(message: TMessage): string | undefined;

  /**
   * Create initial user message for error display
   */
  createUserMessage(text: string): TMessage;
}

interface UseChatProps<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  apiKey: string;
  model: string;
  thinking: string;
  temperature: number;
  enabledTools: Record<string, boolean>;
  mcpStatus: "connected" | "connecting" | "error";
  mcpError: string | null;
  checkMcpConnection: () => Promise<void>;
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  extraParams?: Record<string, unknown>;
}

interface UseChatReturn {
  messages: UIMessage[];
  isAssistantResponding: boolean;
  activeModel: string | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  handleSend: (
    message: string,
    options?: { thinking?: string; temperature?: number },
  ) => Promise<void>;
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  clearConversation: () => void;
  stopResponse: () => void;
}

/**
 * Generic chat hook that works with any provider via an adapter
 *
 * @param {UseChatProps} props - Chat configuration and adapter
 * @returns {UseChatReturn} Chat state and handlers
 */
// eslint-disable-next-line max-lines-per-function
export function useChat<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>({
  apiKey,
  model,
  thinking,
  temperature,
  enabledTools,
  mcpStatus,
  mcpError,
  checkMcpConnection,
  adapter,
  extraParams,
}: UseChatProps<TClient, TMessage, TConfig>): UseChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [activeThinking, setActiveThinking] = useState<string | null>(null);
  const [activeTemperature, setActiveTemperature] = useState<number | null>(
    null,
  );
  const clientRef = useRef<TClient | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearConversation = useCallback(() => {
    setMessages([]);
    clientRef.current = null;
    setActiveModel(null);
    setActiveThinking(null);
    setActiveTemperature(null);
  }, []);

  const stopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsAssistantResponding(false);
  }, []);

  const initializeChat = useCallback(
    async (
      chatHistory?: TMessage[],
      overrides?: { thinking?: string; temperature?: number },
    ) => {
      await validateMcpConnection(mcpStatus, mcpError, checkMcpConnection);

      const effectiveThinking = overrides?.thinking ?? thinking;
      const effectiveTemperature = overrides?.temperature ?? temperature;

      const config = adapter.buildConfig(
        model,
        effectiveTemperature,
        effectiveThinking,
        enabledTools,
        chatHistory,
        extraParams,
      );

      clientRef.current = adapter.createClient(apiKey, config);
      await clientRef.current.initialize();
      setActiveModel(model);
      setActiveThinking(effectiveThinking);
      setActiveTemperature(effectiveTemperature);
    },
    [
      mcpStatus,
      mcpError,
      checkMcpConnection,
      model,
      temperature,
      thinking,
      enabledTools,
      apiKey,
      adapter,
      extraParams,
    ],
  );

  const handleSend = useCallback(
    async (
      message: string,
      options?: { thinking?: string; temperature?: number },
    ) => {
      const userMessage = message.trim();
      if (!userMessage) return;

      if (!apiKey) {
        const userMessageEntry = adapter.createUserMessage(userMessage);
        setMessages(
          adapter.createErrorMessage(
            new Error(
              "No API key configured. Please add your API key in Settings.",
            ),
            [userMessageEntry],
          ),
        );
        return;
      }
      setIsAssistantResponding(true);
      try {
        if (!clientRef.current) {
          await initializeChat(undefined, options);
        }

        if (!clientRef.current) {
          throw new Error("Failed to initialize chat client");
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const stream = clientRef.current.sendMessage(
          userMessage,
          controller.signal,
        );

        await handleMessageStream(stream, adapter.formatMessages, setMessages);
      } catch (error) {
        setMessages(
          adapter.createErrorMessage(
            error,
            clientRef.current?.chatHistory ?? [],
          ),
        );
      } finally {
        abortControllerRef.current = null;
        setIsAssistantResponding(false);
      }
    },
    [apiKey, initializeChat, adapter],
  );

  const handleRetry = useCallback(
    async (mergedMessageIndex: number) => {
      if (!apiKey) return;

      const message = messages[mergedMessageIndex];
      if (message?.role !== "user") return;

      if (!clientRef.current) return;

      const rawIndex = message.rawHistoryIndex;
      const rawMessage = clientRef.current.chatHistory[rawIndex];
      if (!rawMessage) return;

      // Extract the user message text using adapter
      const userMessage = adapter.extractUserMessage(rawMessage);

      if (!userMessage) return;

      setIsAssistantResponding(true);

      try {
        // Slice history to exclude this message and everything after
        const slicedHistory = clientRef.current.chatHistory.slice(0, rawIndex);

        await initializeChat(slicedHistory);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const stream = clientRef.current.sendMessage(
          userMessage,
          controller.signal,
        );

        await handleMessageStream(stream, adapter.formatMessages, setMessages);
      } catch (error) {
        setMessages(
          adapter.createErrorMessage(error, clientRef.current.chatHistory),
        );
      } finally {
        abortControllerRef.current = null;
        setIsAssistantResponding(false);
      }
    },
    [apiKey, messages, initializeChat, adapter],
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
