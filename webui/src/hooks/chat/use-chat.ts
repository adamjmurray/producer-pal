// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef, useState } from "preact/hooks";
import { type UIMessage } from "#webui/types/messages";
import {
  filterOverrides,
  validateMcpConnection,
} from "./helpers/streaming-helpers";
import { useActiveSettings } from "./helpers/use-active-settings";
import { useExecuteWithRetry } from "./helpers/use-execute-with-retry";
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
  const clientRef = useRef<TClient | null>(null);
  const pendingHistoryRef = useRef<TMessage[] | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const thinkingRef = useRef(active.activeThinking);
  const temperatureRef = useRef(active.activeTemperature);

  thinkingRef.current = active.activeThinking;
  temperatureRef.current = active.activeTemperature;

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
  }, [clearSettings, abortRetry]);

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
  }, [abortRetry]);

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

  const runWithChat = useCallback(
    async (fn: () => Promise<void>) => {
      setIsAssistantResponding(true);

      try {
        await fn();
      } catch (error) {
        setMessages(
          adapter.createErrorMessage(
            error,
            clientRef.current?.chatHistory ?? [],
          ),
        );

        if (clientRef.current) autoSaveRef?.current?.();
      } finally {
        abortControllerRef.current = null;
        setIsAssistantResponding(false);
        setRateLimitState(null);
      }
    },
    [adapter, autoSaveRef],
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

      await runWithChat(async () => {
        if (!clientRef.current) {
          const pendingHistory = pendingHistoryRef.current ?? undefined;

          pendingHistoryRef.current = null;
          await initializeChat(pendingHistory, options);
        }

        const client = clientRef.current;

        if (!client) {
          throw new Error("Failed to initialize chat client");
        }

        const controller = new AbortController();

        abortControllerRef.current = controller;

        const filtered = filterOverrides(options, {
          thinking: thinkingRef.current,
        });

        await executeWithRetry({
          executeStream: (msg) =>
            client.sendMessage(msg, controller.signal, filtered),
          getHistory: () => client.chatHistory,
          originalMessage: userMessage,
        });
      });
    },
    [apiKey, adapter, initializeChat, runWithChat, executeWithRetry],
  );

  const forkConversation = useCallback(
    async (mergedMessageIndex: number, newMessage: string) => {
      if (!apiKey) return;

      const message = messages[mergedMessageIndex];

      if (message?.role !== "user") return;

      const rawIndex = message.rawHistoryIndex;
      const history =
        clientRef.current?.chatHistory ?? pendingHistoryRef.current;

      if (!history) return;

      await runWithChat(async () => {
        const slicedHistory = history.slice(0, rawIndex);

        pendingHistoryRef.current = null;

        await initializeChat(slicedHistory);

        const client = clientRef.current as NonNullable<
          typeof clientRef.current
        >;

        const controller = new AbortController();

        abortControllerRef.current = controller;

        await executeWithRetry({
          executeStream: (msg) => client.sendMessage(msg, controller.signal),
          getHistory: () => client.chatHistory,
          originalMessage: newMessage,
        });
      });
    },
    [apiKey, messages, initializeChat, runWithChat, executeWithRetry],
  );

  const handleRetry = useCallback(
    async (mergedMessageIndex: number) => {
      const message = messages[mergedMessageIndex];

      if (message?.role !== "user") return;

      const history =
        clientRef.current?.chatHistory ?? pendingHistoryRef.current;

      if (!history) return;

      const rawMessage = history[message.rawHistoryIndex];

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
    ...active,
    rateLimitState,
    handleSend,
    handleRetry,
    handleEdit,
    clearConversation,
    stopResponse,
    getChatHistory,
    restoreChatHistory,
  };
}
