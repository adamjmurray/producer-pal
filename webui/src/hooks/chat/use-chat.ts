// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
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
import { useCompaction } from "./use-compaction";

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
  const [toolLimitReached, setToolLimitReached] = useState(false);
  const clientRef = useRef<TClient | null>(null);
  const pendingHistoryRef = useRef<TMessage[] | null>(null);
  // Bootstraps a client from pending history when compaction is requested on a
  // restored-but-not-yet-sent conversation. Held in a ref because useCompaction
  // is created before initializeChat is defined below.
  const bootstrapClientRef = useRef<(() => Promise<void>) | null>(null);
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

  const {
    isCompacting,
    isCompactingRef,
    canUndoCompaction,
    compact,
    undoCompaction,
    invalidateCompactionUndo,
  } = useCompaction({
    clientRef,
    bootstrapClientRef,
    adapter,
    autoSaveRef,
    messages,
    isAssistantResponding,
    setMessages,
  });

  const clearConversation = useCallback(() => {
    setMessages([]);
    clientRef.current?.dispose?.();
    clientRef.current = null;
    pendingHistoryRef.current = null;
    // Abort any in-flight stream on teardown. UI-driven switches call
    // stopResponse() first, but a browser Back/Forward (hashchange) reaches here
    // directly — without this, the orphaned stream keeps running and its
    // setMessages clobbers the freshly-restored conversation (and autosaves the
    // mixed history under the new ID). Aborting an already-aborted controller is
    // a no-op, so this is safe for every entry point.
    abortControllerRef.current?.abort();
    clearSettings();
    setRateLimitState(null);
    setToolLimitReached(false);
    invalidateCompactionUndo();
    abortRetry();
  }, [clearSettings, abortRetry, invalidateCompactionUndo]);

  const getChatHistory = useCallback(
    (): unknown[] =>
      clientRef.current?.chatHistory ?? pendingHistoryRef.current ?? [],
    [],
  );

  const restoreChatHistory = useCallback(
    (chatHistory: unknown[], lockedSettings?: ConversationLockedSettings) => {
      // No dispose() here: every caller reaches this with no live client —
      // either on mount (clientRef is still null) or right after
      // clearConversation() (which already disposed). The two sites that
      // actually replace a live client — clearConversation and initializeChat —
      // own the dispose.
      clientRef.current = null;
      pendingHistoryRef.current = chatHistory as TMessage[];
      setMessages(adapter.formatMessages(chatHistory as TMessage[]));
      restoreSettings(lockedSettings);
      setRateLimitState(null);
      setToolLimitReached(false);
      invalidateCompactionUndo();
    },
    [adapter, restoreSettings, invalidateCompactionUndo],
  );

  const stopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    abortRetry();
    setIsAssistantResponding(false);
    setRateLimitState(null);
    setToolLimitReached(false);
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

      // Dispose any prior client before replacing it — initializeChat is the
      // fork/retry re-init path, so a live client (with an open MCP connection)
      // can already be here.
      clientRef.current?.dispose?.();
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

  // Bootstrap a client from the restored history (mirrors handleSend's first-
  // send path). Synced into bootstrapClientRef so compaction — created above,
  // before initializeChat — can reach it without a forward reference.
  const bootstrapClient = useCallback(async () => {
    const pendingHistory = pendingHistoryRef.current;

    if (!pendingHistory || !apiKey) return;

    pendingHistoryRef.current = null;
    await initializeChat(pendingHistory);
  }, [apiKey, initializeChat]);

  useEffect(() => {
    bootstrapClientRef.current = bootstrapClient;
  }, [bootstrapClient]);

  // Stash the user message for retry/edit when an early error (missing API
  // key, MCP init failure) means it never reached client.chatHistory.
  const pendingUserMessageRef = useRef<TMessage | null>(null);

  const runWithChat = useCallback(
    async (fn: () => Promise<void>, userMessage?: TMessage) => {
      setIsAssistantResponding(true);
      // A new request clears any prior tool-limit notice before streaming.
      setToolLimitReached(false);
      pendingUserMessageRef.current = userMessage ?? null;

      try {
        await fn();
        pendingUserMessageRef.current = null;
        setToolLimitReached(clientRef.current?.toolLimitReached ?? false);
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

        if (clientRef.current) {
          // createErrorMessage mutates errorHistory. When errorHistory is a
          // fresh copy (includeStashed path), the error didn't reach
          // chatHistory, so auto-save would persist the user message
          // without it. Push the error into chatHistory directly.
          if (errorHistory !== clientRef.current.chatHistory) {
            clientRef.current.chatHistory.push(errorHistory.at(-1) as TMessage);
          }

          autoSaveRef?.current?.();
        }
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
      const userMessage = message.trim();

      if (!userMessage) return;

      // Guard the send-during-compaction race at the hook level, not just via
      // the disabled input: compact() reassigns client.chatHistory mid-flight,
      // so a concurrent send would corrupt history. Ref (not state) so a future
      // caller that bypasses the disabled-input prop is still protected.
      if (isCompactingRef.current) return;

      // Continuing the conversation invalidates the compaction undo snapshot.
      invalidateCompactionUndo();

      const userMessageEntry = adapter.createUserMessage(userMessage);

      if (!apiKey) {
        // Stash so retry/edit can recover after the user fixes settings.
        pendingHistoryRef.current = [userMessageEntry];
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
      }, userMessageEntry);
    },
    [
      apiKey,
      adapter,
      initializeChat,
      runWithChat,
      executeWithRetry,
      invalidateCompactionUndo,
      isCompactingRef,
    ],
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

      invalidateCompactionUndo();

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
    [
      apiKey,
      messages,
      initializeChat,
      runWithChat,
      executeWithRetry,
      invalidateCompactionUndo,
    ],
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
    toolLimitReached,
    isCompacting,
    canUndoCompaction,
    handleSend,
    handleRetry,
    handleEdit,
    compact,
    undoCompaction,
    clearConversation,
    stopResponse,
    getChatHistory,
    restoreChatHistory,
  };
}
