// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type UIMessage } from "#webui/types/messages";
import {
  filterOverrides,
  recoverFromChatError,
  resolveInitConnection,
  showMissingApiKeyError,
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
import { useConversationActions } from "./use-conversation-actions";
import { useGetChatHistory } from "./use-get-chat-history";
import { useMessageQueue } from "./use-message-queue";

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
  enabledTools,
  smallModelMode,
  mcpStatus,
  mcpError,
  checkMcpConnection,
  resolveConnection,
  adapter,
  extraParams,
  autoSaveRef,
  pendingForkRef,
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

  // Dispose the live MCP client when the hook unmounts. Switching between chat
  // and voice mode swaps ChatApp out (App.tsx routes one or the other), so
  // useChat can unmount mid-session with a live client. The dispose() calls in
  // clearConversation/initializeChat only cover client *replacement*, not
  // teardown, so without this the final client's MCP connection leaks. dispose()
  // is idempotent, so this no-ops when the client was already disposed/cleared.
  useEffect(() => () => clientRef.current?.dispose?.(), []);

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

  const stopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    // Drop any pending-fork signal on teardown. A fork aborted before it streamed
    // assistant content never autosaves, so the signal would otherwise linger and
    // mis-branch the next, unrelated conversation's save into a spurious sibling.
    if (pendingForkRef) pendingForkRef.current = null;
    abortRetry();
    setIsAssistantResponding(false);
    setRateLimitState(null);
    setToolLimitReached(false);
    // Deliberately leave the queue intact: aborting a turn is the same as a
    // failed turn, so queued follow-ups stay visible and flush on the next send.
    // Tearing down for a conversation switch clears the queue in clearConversation.
  }, [abortRetry, pendingForkRef]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    clientRef.current?.dispose?.();
    clientRef.current = null;
    pendingHistoryRef.current = null;
    // stopResponse aborts any in-flight stream and resets the transient response
    // state (incl. the pending-fork signal). A UI-driven switch already called it,
    // but a browser Back/Forward (hashchange) reaches here directly — without the
    // abort the orphaned stream's setMessages clobbers the freshly-restored
    // conversation and autosaves the mixed history under the new id. Idempotent,
    // so safe for every entry point.
    stopResponse();
    // Switching/clearing a conversation drops any queued follow-ups so they
    // can't leak into the next conversation (stopResponse leaves them intact
    // for the abort-the-current-turn case).
    clearQueue();
    clearSettings();
    invalidateCompactionUndo();
  }, [stopResponse, clearQueue, clearSettings, invalidateCompactionUndo]);

  const getChatHistory = useGetChatHistory(clientRef, pendingHistoryRef);

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

  const initializeChat = useCallback(
    async (chatHistory?: TMessage[], overrides?: MessageOverrides) => {
      await validateMcpConnection(mcpStatus, mcpError, checkMcpConnection);

      const effectiveThinking = overrides?.thinking ?? thinking;
      // Continue a restored conversation on its locked provider+model (see
      // resolveInitConnection); brand-new conversations fall back to current
      // settings. Rebuilding from current settings here is what previously
      // switched restored conversations to the selected model on the next send.
      const init = resolveInitConnection(
        active,
        { provider, model },
        resolveConnection,
        extraParams,
      );

      const config = adapter.buildConfig(
        init.model,
        effectiveThinking,
        enabledTools,
        chatHistory,
        init.extraParams,
      );

      // Dispose any prior client before replacing it — initializeChat is the
      // fork/retry re-init path, so a live client (with an open MCP connection)
      // can already be here.
      clientRef.current?.dispose?.();
      clientRef.current = adapter.createClient(init.apiKey, config);
      await clientRef.current.initialize();
      lockSettings({
        model: init.model,
        provider: init.provider,
        thinking: effectiveThinking,
        smallModelMode,
        systemInstruction: init.systemInstruction,
        notation: init.notation,
        // The toolset this client was just built with. Unlike the others this is
        // always the CURRENT setting, never a restored snapshot — a restored
        // conversation reconnects with today's tools on purpose. Recording it is
        // what lets the settings notice point out that they moved.
        enabledTools,
      });
    },
    [
      smallModelMode,
      mcpStatus,
      mcpError,
      checkMcpConnection,
      model,
      provider,
      thinking,
      enabledTools,
      resolveConnection,
      active,
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
    async <T>(
      fn: () => Promise<T>,
      userMessage?: TMessage,
    ): Promise<T | undefined> => {
      setIsAssistantResponding(true);
      // A new request clears any prior tool-limit notice before streaming.
      setToolLimitReached(false);
      pendingUserMessageRef.current = userMessage ?? null;

      try {
        const result = await fn();

        pendingUserMessageRef.current = null;
        setToolLimitReached(clientRef.current?.toolLimitReached ?? false);

        return result;
      } catch (error) {
        recoverFromChatError({
          error,
          adapter,
          clientRef,
          pendingHistoryRef,
          stashed: pendingUserMessageRef.current,
          setMessages,
          autoSaveRef,
          pendingForkRef,
        });

        return undefined;
      } finally {
        pendingUserMessageRef.current = null;
        abortControllerRef.current = null;
        setIsAssistantResponding(false);
        setRateLimitState(null);
      }
    },
    [adapter, autoSaveRef, pendingForkRef],
  );

  const handleSend = useCallback(
    async (message: string, options?: MessageOverrides) => {
      let currentMessage = message;
      let currentOptions = options;

      while (true) {
        const userMessage = currentMessage.trim();

        if (!userMessage) return;

        // Guard the send-during-compaction race at the hook level, not just via
        // the disabled input: compact() reassigns client.chatHistory mid-flight,
        // so a concurrent send would corrupt history. Ref (not state) so a future
        // caller that bypasses the disabled-input prop is still protected.
        if (isCompactingRef.current) return;

        // Continuing the conversation invalidates the compaction undo snapshot.
        invalidateCompactionUndo();

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
          // Interrupt this turn only when the user enqueues a NEW message while
          // it streams — measured against the queue length at send start, not
          // "queue is non-empty". A queue carried over from a prior failed turn
          // (the error path below preserves it) must not self-interrupt this
          // send; it drains normally once this turn completes.
          const queueBaseline = queueRef.current.length;
          const shouldInterrupt = () => queueRef.current.length > queueBaseline;

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

        // A failed turn leaves any queued messages untouched rather than
        // dropping them: they stay visible and flush on the next successful
        // send (the queueBaseline above keeps that next send from being
        // truncated by the carryover).
        if (!succeeded) return;

        const { messages: queued, overrides } = drainQueue();

        if (queued.length === 0) return;

        // Queued follow-ups coalesce into a single user turn (joined by blank
        // lines); the overrides (currently just `thinking`) were captured once
        // from the first queued message and apply to the merged turn.
        currentMessage = queued.map((m) => m.text).join("\n\n");
        currentOptions = overrides;
      }
    },
    [
      apiKey,
      adapter,
      initializeChat,
      runWithChat,
      executeWithRetry,
      invalidateCompactionUndo,
      isCompactingRef,
      queueRef,
      drainQueue,
    ],
  );

  // After a successful fork, flush any queued follow-ups through the normal send
  // path so they don't strand in the queue until the user sends again. handleSend
  // gives them proper user bubbles, override handling, and its own drain loop.
  const drainQueuedFollowUps = useCallback(async () => {
    const { messages: queued, overrides } = drainQueue();

    if (queued.length === 0) return;

    await handleSend(queued.map((m) => m.text).join("\n\n"), overrides);
  }, [drainQueue, handleSend]);

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
    invalidateCompactionUndo,
    pendingForkRef,
    autoSaveRef,
    drainQueuedFollowUps,
  });

  return {
    messages,
    isAssistantResponding,
    ...active,
    rateLimitState,
    queuedMessages,
    enqueueMessage,
    removeMessage,
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
