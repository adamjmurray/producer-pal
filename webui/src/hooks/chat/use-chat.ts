// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type UIMessage } from "#webui/types/messages";
import {
  filterOverrides,
  showMissingApiKeyError,
  validateMcpConnection,
} from "./helpers/streaming-helpers";
import { useActiveSettings } from "./helpers/use-active-settings";
import { useConversationActions } from "./helpers/use-conversation-actions";
import { useExecuteWithRetry } from "./helpers/use-execute-with-retry";
import { useMessageQueue } from "./helpers/use-message-queue";
import {
  type ChatClient,
  type ConversationLockedSettings,
  type MessageOverrides,
  type RateLimitState,
  type UseChatProps,
  type UseChatReturn,
} from "./use-chat-types";

/**
 * Generic chat hook that works with any provider via an adapter
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
  smallModelMode,
  mcpStatus,
  mcpError,
  checkMcpConnection,
  adapter,
  extraParams,
  autoSaveRef,
}: UseChatProps<TClient, TMessage, TConfig>): UseChatReturn {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);
  const active = useActiveSettings();
  const { lockSettings, restoreSettings, clearSettings } = active;
  const [rateLimitState, setRateLimitState] = useState<RateLimitState | null>(
    null,
  );
  const {
    queuedMessages,
    queueRef,
    enqueueMessage,
    removeMessage,
    drainQueue,
    clearQueue,
  } = useMessageQueue();
  const clientRef = useRef<TClient | null>(null);
  const pendingHistoryRef = useRef<TMessage[] | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const thinkingRef = useRef(active.activeThinking);

  useEffect(() => {
    thinkingRef.current = active.activeThinking;
  }, [active.activeThinking]);

  const { executeWithRetry, abortRetry } = useExecuteWithRetry({
    adapter,
    autoSaveRef,
    abortControllerRef,
    setMessages,
    setRateLimitState,
  });

  const clearConversation = useCallback(() => {
    setMessages([]);
    clientRef.current = null;
    pendingHistoryRef.current = null;
    clearSettings();
    setRateLimitState(null);
    abortRetry();
    clearQueue();
  }, [clearSettings, abortRetry, clearQueue]);

  const getChatHistory = useCallback(
    (): unknown[] =>
      clientRef.current?.chatHistory ?? pendingHistoryRef.current ?? [],
    [],
  );

  const restoreChatHistory = useCallback(
    (chatHistory: unknown[], lockedSettings?: ConversationLockedSettings) => {
      clientRef.current = null;
      pendingHistoryRef.current = chatHistory as TMessage[];
      setMessages(adapter.formatMessages(chatHistory as TMessage[]));
      restoreSettings(lockedSettings);
      setRateLimitState(null);
    },
    [adapter, restoreSettings],
  );

  const stopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    abortRetry();
    setIsAssistantResponding(false);
    setRateLimitState(null);
    clearQueue();
  }, [abortRetry, clearQueue]);

  const initializeChat = useCallback(
    async (chatHistory?: TMessage[], overrides?: MessageOverrides) => {
      await validateMcpConnection(mcpStatus, mcpError, checkMcpConnection);

      const effectiveThinking = overrides?.thinking ?? thinking;

      const config = adapter.buildConfig(
        model,
        temperature,
        effectiveThinking,
        enabledTools,
        chatHistory,
        extraParams,
      );

      clientRef.current = adapter.createClient(apiKey, config);
      await clientRef.current.initialize();
      lockSettings(
        model,
        provider,
        effectiveThinking,
        temperature,
        null,
        smallModelMode,
      );
    },
    [
      smallModelMode,
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
      lockSettings,
    ],
  );

  // Stash the user message for retry/edit when an early error (missing API
  // key, MCP init failure) means it never reached client.chatHistory.
  const pendingUserMessageRef = useRef<TMessage | null>(null);

  const runWithChat = useCallback(
    async <T>(
      fn: () => Promise<T>,
      userMessage?: TMessage,
    ): Promise<T | undefined> => {
      setIsAssistantResponding(true);
      pendingUserMessageRef.current = userMessage ?? null;

      try {
        const result = await fn();

        pendingUserMessageRef.current = null;

        return result;
      } catch (error) {
        const baseHistory = clientRef.current?.chatHistory ?? [];
        const stashed = pendingUserMessageRef.current;
        // When init fails before client.sendMessage, the user message never
        // reached chatHistory. Surface it in the error UI and stash it for
        // retry/edit so the user isn't stranded if there's no usable client.
        const includeStashed = stashed && !baseHistory.includes(stashed);
        const errorHistory = includeStashed
          ? [...baseHistory, stashed]
          : baseHistory;

        if (!clientRef.current && includeStashed) {
          pendingHistoryRef.current = [stashed] as TMessage[];
        }

        setMessages(adapter.createErrorMessage(error, errorHistory));

        if (clientRef.current) autoSaveRef?.current?.();

        return undefined;
      } finally {
        pendingUserMessageRef.current = null;
        abortControllerRef.current = null;
        setIsAssistantResponding(false);
        setRateLimitState(null);
      }
    },
    [adapter, autoSaveRef],
  );

  const handleSend = useCallback(
    async (message: string, options?: MessageOverrides) => {
      let currentMessage = message;
      let currentOptions = options;

      while (true) {
        const userMessage = currentMessage.trim();

        if (!userMessage) return;

        if (!apiKey) {
          showMissingApiKeyError(
            adapter,
            userMessage,
            setMessages,
            pendingHistoryRef,
          );

          return;
        }

        const userMessageEntry = adapter.createUserMessage(userMessage);
        const sendOptions = currentOptions;

        const succeeded = await runWithChat(async () => {
          if (!clientRef.current) {
            const pendingHistory = pendingHistoryRef.current ?? undefined;

            pendingHistoryRef.current = null;
            await initializeChat(pendingHistory, sendOptions);
          }

          const client = clientRef.current;

          if (!client) {
            throw new Error("Failed to initialize chat client");
          }

          const controller = new AbortController();

          abortControllerRef.current = controller;

          const filtered = filterOverrides(sendOptions, {
            thinking: thinkingRef.current,
          });
          const shouldInterrupt = () => queueRef.current.length > 0;

          return await executeWithRetry({
            executeStream: (msg) =>
              client.sendMessage(
                msg,
                controller.signal,
                filtered,
                shouldInterrupt,
              ),
            getHistory: () => client.chatHistory,
            originalMessage: userMessage,
          });
        }, userMessageEntry);

        if (!succeeded) return;

        const queued = drainQueue();

        if (queued.length === 0) return;

        currentMessage = queued.map((m) => m.text).join("\n\n");
        currentOptions = queued[0]?.overrides;
      }
    },
    [
      apiKey,
      adapter,
      initializeChat,
      runWithChat,
      executeWithRetry,
      queueRef,
      drainQueue,
    ],
  );

  const { handleRetry, handleEdit } = useConversationActions({
    apiKey,
    messages,
    adapter,
    clientRef,
    pendingHistoryRef,
    abortControllerRef,
    initializeChat,
    runWithChat,
    executeWithRetry,
    clearQueue,
  });

  return {
    messages,
    isAssistantResponding,
    ...active,
    rateLimitState,
    queuedMessages,
    enqueueMessage,
    removeMessage,
    handleSend,
    handleRetry,
    handleEdit,
    clearConversation,
    stopResponse,
    getChatHistory,
    restoreChatHistory,
  };
}
