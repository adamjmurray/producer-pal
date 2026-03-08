// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef, useState } from "preact/hooks";
import {
  detectRateLimit,
  calculateRetryDelay,
  shouldRetry,
  MAX_RETRY_ATTEMPTS,
} from "#webui/lib/rate-limit";
import { type UIMessage } from "#webui/types/messages";
import { type Provider } from "#webui/types/settings";
import {
  handleMessageStream,
  validateMcpConnection,
} from "./helpers/streaming-helpers";
import {
  type ChatAdapter,
  type ChatClient,
  type MessageOverrides,
  type RateLimitState,
  type UseChatProps,
  type UseChatReturn,
} from "./use-chat-types";

export type {
  ChatAdapter,
  ChatClient,
  MessageOverrides,
  RateLimitState,
  UseChatReturn,
};

/**
 * Generic chat hook that works with any provider via an adapter
 *
 * @param {UseChatProps} props - Chat configuration and adapter
 * @returns {UseChatReturn} Chat state and handlers
 */
// eslint-disable-next-line max-lines-per-function -- main hook function with multiple handlers
export function useChat<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>({
  provider,
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
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);
  const [activeThinking, setActiveThinking] = useState<string | null>(null);
  const [activeTemperature, setActiveTemperature] = useState<number | null>(
    null,
  );
  const [rateLimitState, setRateLimitState] = useState<RateLimitState | null>(
    null,
  );
  const clientRef = useRef<TClient | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryAbortRef = useRef<AbortController | null>(null);

  const clearConversation = useCallback(() => {
    setMessages([]);
    clientRef.current = null;
    setActiveModel(null);
    setActiveProvider(null);
    setActiveThinking(null);
    setActiveTemperature(null);
    setRateLimitState(null);
    retryAbortRef.current?.abort();
  }, []);

  const stopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    retryAbortRef.current?.abort();
    setIsAssistantResponding(false);
    setRateLimitState(null);
  }, []);

  const initializeChat = useCallback(
    async (chatHistory?: TMessage[], overrides?: MessageOverrides) => {
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
      setActiveProvider(provider);
      setActiveThinking(effectiveThinking);
      setActiveTemperature(effectiveTemperature);
    },
    [
      mcpStatus,
      mcpError,
      checkMcpConnection,
      model,
      provider,
      temperature,
      thinking,
      enabledTools,
      apiKey,
      adapter,
      extraParams,
    ],
  );

  /**
   * Executes a stream request with automatic retry on rate limit errors.
   * If content was received before the error, sends "continue" on retry
   * instead of the original message.
   */
  const executeWithRetry = useCallback(
    async (
      executeStream: (message: string) => AsyncIterable<TMessage[]>,
      getChatHistory: () => TMessage[],
      originalMessage: string,
    ): Promise<void> => {
      let attempt = 0;
      // Use mutable object so callback can set it and loop can read updated value
      const contentState = { hasReceived: false };

      retryAbortRef.current = new AbortController();

      const onMessageUpdate = (msgs: UIMessage[]) => {
        contentState.hasReceived = true;
        setMessages(msgs);
      };

      while (shouldRetry(attempt)) {
        try {
          const messageToSend = contentState.hasReceived
            ? "continue"
            : originalMessage;
          const stream = executeStream(messageToSend);

          await handleMessageStream(
            stream,
            adapter.formatMessages,
            onMessageUpdate,
          );
          setRateLimitState(null);

          return;
        } catch (error) {
          // Check if retry was aborted (using signal from loop-scoped controller)
          if (retryAbortRef.current.signal.aborted) {
            return;
          }

          const rateLimitInfo = detectRateLimit(error);

          if (!rateLimitInfo.isRateLimited || !shouldRetry(attempt + 1)) {
            // Not a rate limit error or no more retries - show error
            setMessages(adapter.createErrorMessage(error, getChatHistory()));
            setRateLimitState(null);

            return;
          }

          // Calculate delay and update state for UI
          const delayMs = calculateRetryDelay(
            attempt,
            rateLimitInfo.retryAfterMs,
          );

          setRateLimitState({
            isRetrying: true,
            attempt,
            maxAttempts: MAX_RETRY_ATTEMPTS,
            delayMs,
          });

          // Wait before retrying
          await new Promise<void>((resolve, reject) => {
            const timeoutId = setTimeout(resolve, delayMs);

            retryAbortRef.current?.signal.addEventListener("abort", () => {
              clearTimeout(timeoutId);
              reject(new Error("Retry cancelled"));
            });
          });

          attempt++;
        }
      }
    },
    [adapter],
  );

  const handleSend = useCallback(
    async (message: string, options?: MessageOverrides) => {
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

        const client = clientRef.current;

        if (!client) {
          throw new Error("Failed to initialize chat client");
        }

        const controller = new AbortController();

        abortControllerRef.current = controller;

        await executeWithRetry(
          (msg) => client.sendMessage(msg, controller.signal, options),
          () => client.chatHistory,
          userMessage,
        );
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
        setRateLimitState(null);
      }
    },
    [apiKey, initializeChat, adapter, executeWithRetry],
  );

  const forkConversation = useCallback(
    async (mergedMessageIndex: number, newMessage: string) => {
      if (!apiKey || !clientRef.current) return;

      const message = messages[mergedMessageIndex];

      if (message?.role !== "user") return;

      const rawIndex = message.rawHistoryIndex;

      setIsAssistantResponding(true);

      try {
        const slicedHistory = clientRef.current.chatHistory.slice(0, rawIndex);

        await initializeChat(slicedHistory);

        const client = clientRef.current as NonNullable<
          typeof clientRef.current
        >;

        const controller = new AbortController();

        abortControllerRef.current = controller;

        await executeWithRetry(
          (msg) => client.sendMessage(msg, controller.signal),
          () => client.chatHistory,
          newMessage,
        );
      } catch (error) {
        setMessages(
          adapter.createErrorMessage(error, clientRef.current.chatHistory),
        );
      } finally {
        abortControllerRef.current = null;
        setIsAssistantResponding(false);
        setRateLimitState(null);
      }
    },
    [apiKey, messages, initializeChat, adapter, executeWithRetry],
  );

  const handleRetry = useCallback(
    async (mergedMessageIndex: number) => {
      if (!clientRef.current) return;

      const message = messages[mergedMessageIndex];

      if (message?.role !== "user") return;

      const rawMessage = clientRef.current.chatHistory[message.rawHistoryIndex];

      if (!rawMessage) return;

      const userMessage = adapter.extractUserMessage(rawMessage);

      if (!userMessage) return;

      await forkConversation(mergedMessageIndex, userMessage);
    },
    [messages, adapter, forkConversation],
  );

  const handleEdit = useCallback(
    async (mergedMessageIndex: number, newMessage: string) => {
      const trimmed = newMessage.trim();

      if (!trimmed) return;

      await forkConversation(mergedMessageIndex, trimmed);
    },
    [forkConversation],
  );

  return {
    messages,
    isAssistantResponding,
    activeModel,
    activeProvider,
    activeThinking,
    activeTemperature,
    rateLimitState,
    handleSend,
    handleRetry,
    handleEdit,
    clearConversation,
    stopResponse,
  };
}
