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
import {
  filterOverrides,
  handleMessageStream,
  showMissingApiKeyError,
  validateMcpConnection,
} from "./helpers/streaming-helpers";
import { useActiveSettings } from "./helpers/use-active-settings";
import { useConversationActions } from "./helpers/use-conversation-actions";
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
  const retryAbortRef = useRef<AbortController | null>(null);
  const thinkingRef = useRef(active.activeThinking);
  const temperatureRef = useRef(active.activeTemperature);

  thinkingRef.current = active.activeThinking;
  temperatureRef.current = active.activeTemperature;

  const clearConversation = useCallback(() => {
    setMessages([]);
    clientRef.current = null;
    pendingHistoryRef.current = null;
    clearSettings();
    setRateLimitState(null);
    retryAbortRef.current?.abort();
    clearQueue();
  }, [clearSettings, clearQueue]);

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
    retryAbortRef.current?.abort();
    setIsAssistantResponding(false);
    setRateLimitState(null);
    clearQueue();
  }, [clearQueue]);

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

  const executeWithRetry = useCallback(
    async (
      executeStream: (message: string) => AsyncIterable<TMessage[]>,
      getHistory: () => TMessage[],
      originalMessage: string,
    ): Promise<boolean> => {
      let attempt = 0;
      const contentState = { hasReceived: false, savedUsageCount: 0 };

      retryAbortRef.current = new AbortController();

      const onMessageUpdate = (msgs: UIMessage[]) => {
        // Skip updates after abort (e.g. user switched conversations)
        if (abortControllerRef.current?.signal.aborted) return;

        const isFirst = !contentState.hasReceived;

        contentState.hasReceived = true;
        setMessages(msgs);

        // Save on first content or when a new step completes (usage appears)
        const usageCount = msgs.filter((m) => m.usage).length;

        if (isFirst || usageCount > contentState.savedUsageCount) {
          contentState.savedUsageCount = usageCount;
          autoSaveRef?.current?.();
        }
      };

      while (shouldRetry(attempt)) {
        try {
          const msg = contentState.hasReceived ? "continue" : originalMessage;

          await handleMessageStream(
            executeStream(msg),
            adapter.formatMessages,
            onMessageUpdate,
          );
          setRateLimitState(null);

          return true;
        } catch (error) {
          if (retryAbortRef.current.signal.aborted) return false;

          const rateLimitInfo = detectRateLimit(error);

          if (!rateLimitInfo.isRateLimited || !shouldRetry(attempt + 1)) {
            setMessages(adapter.createErrorMessage(error, getHistory()));
            setRateLimitState(null);
            autoSaveRef?.current?.();

            return false;
          }

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

      return false;
    },
    [adapter, autoSaveRef],
  );

  const runWithChat = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      setIsAssistantResponding(true);

      try {
        return await fn();
      } catch (error) {
        setMessages(
          adapter.createErrorMessage(
            error,
            clientRef.current?.chatHistory ?? [],
          ),
        );

        if (clientRef.current) autoSaveRef?.current?.();

        return undefined;
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
        showMissingApiKeyError(adapter, userMessage, setMessages);

        return;
      }

      const succeeded = await runWithChat(async () => {
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
        const shouldInterrupt = () => queueRef.current.length > 0;

        return await executeWithRetry(
          (msg) =>
            client.sendMessage(
              msg,
              controller.signal,
              filtered,
              shouldInterrupt,
            ),
          () => client.chatHistory,
          userMessage,
        );
      });

      if (succeeded) {
        const queued = drainQueue();

        if (queued.length > 0) {
          const combined = queued.map((m) => m.text).join("\n\n");

          await handleSend(combined, queued[0]?.overrides);
        }
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
