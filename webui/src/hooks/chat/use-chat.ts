// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { haltRunningToolCalls } from "#webui/chat/helpers/halt-running-tool-calls";
import { type UIMessage } from "#webui/types/messages";
import {
  beginTurn,
  filterOverrides,
  runChatTurn,
  showMissingApiKeyError,
} from "./helpers/streaming-helpers";
import { useActiveSettings } from "./helpers/use-active-settings";
import { useExecuteWithRetry } from "./helpers/use-execute-with-retry";
import { useInitializeChat } from "./helpers/use-initialize-chat";
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
  const { restoreSettings, clearSettings } = active;
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
  // The in-flight client.initialize() of whichever turn built the current
  // client, or null once it settles. clientRef is assigned before that connect
  // resolves, so a turn that finds a client still has to wait on this before
  // streaming; see the send path below.
  const pendingInitRef = useRef<Promise<void> | null>(null);
  const pendingHistoryRef = useRef<TMessage[] | null>(null);
  // Bootstraps a client from pending history when compaction is requested on a
  // restored-but-not-yet-sent conversation. Held in a ref because useCompaction
  // is created before initializeChat is defined below.
  const bootstrapClientRef = useRef<(() => Promise<void>) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Per-turn state runChatTurn owns; see there for why a turn takes a ticket.
  const turnIdRef = useRef(0);
  // Bumped every time the loaded conversation is torn down. A turn that fails
  // after a bump has nothing left to recover onto — see runChatTurn.
  const conversationGenRef = useRef(0);
  const pendingUserMessageRef = useRef<TMessage | null>(null);
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

  const { initializeChat, applyPendingLock, clearPendingLock } =
    useInitializeChat({
      provider,
      model,
      thinking,
      enabledTools,
      mcpStatus,
      mcpError,
      checkMcpConnection,
      resolveConnection,
      adapter,
      extraParams,
      active,
      clientRef,
      pendingInitRef,
    });

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
    pendingHistoryRef,
    adapter,
    autoSaveRef,
    messages,
    isAssistantResponding,
    setMessages,
  });

  const stopResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    // Mark whatever tool call was in flight as stopped. The stream reconciles
    // its own history on the way out, but that repaint arrives after the abort
    // and onMessageUpdate drops it, so the card would otherwise sit at
    // "working…" for the rest of the session.
    setMessages(haltRunningToolCalls);
    // Leave any pending-fork signal set. Stop ends the turn, but the client it
    // built still holds the fork's truncated history, so the teardown autosave
    // that follows must still branch — clearing the signal here made that save
    // reuse the source id and overwrite the conversation with the truncation.
    // clearConversation drops the signal when the conversation itself goes away.
    abortRetry();
    setIsAssistantResponding(false);
    setRateLimitState(null);
    setToolLimitReached(false);
    // Deliberately leave the queue intact: aborting a turn is the same as a
    // failed turn, so queued follow-ups stay visible and flush on the next send.
    // Tearing down for a conversation switch clears the queue in clearConversation.
  }, [abortRetry]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    // Every switch/new/delete/back-forward funnels through here, so this is the
    // one place that knows the conversation a running turn belongs to is gone.
    conversationGenRef.current++;
    clientRef.current?.dispose?.();
    clientRef.current = null;
    // The client this lock described is gone, so it must not carry into the
    // next conversation.
    clearPendingLock();
    pendingHistoryRef.current = null;
    // The conversation this fork branched from is gone, so nothing is left to
    // branch: drop the signal here or it mis-branches the next, unrelated save
    // into a spurious sibling. stopResponse deliberately keeps it.
    if (pendingForkRef) pendingForkRef.current = null;
    // stopResponse aborts any in-flight stream and resets the transient response
    // state. A UI-driven switch already called it, but a browser Back/Forward
    // (hashchange) reaches here directly — without the abort the orphaned
    // stream's setMessages clobbers the freshly-restored conversation and
    // autosaves the mixed history under the new id. Idempotent, so safe for
    // every entry point.
    stopResponse();
    // Switching/clearing a conversation drops any queued follow-ups so they
    // can't leak into the next conversation (stopResponse leaves them intact
    // for the abort-the-current-turn case).
    clearQueue();
    clearSettings();
    invalidateCompactionUndo();
  }, [
    stopResponse,
    clearQueue,
    clearSettings,
    invalidateCompactionUndo,
    clearPendingLock,
    pendingForkRef,
  ]);

  const getChatHistory = useGetChatHistory(clientRef, pendingHistoryRef);

  const restoreChatHistory = useCallback(
    (chatHistory: unknown[], lockedSettings?: ConversationLockedSettings) => {
      // No dispose() here: every caller reaches this with no live client —
      // either on mount (clientRef is still null) or right after
      // clearConversation() (which already disposed). The two sites that
      // actually replace a live client — clearConversation and initializeChat —
      // own the dispose.
      clientRef.current = null;
      // Same as clearConversation: no client, so no lock to hand anyone.
      clearPendingLock();
      pendingHistoryRef.current = chatHistory as TMessage[];
      setMessages(adapter.formatMessages(chatHistory as TMessage[]));
      restoreSettings(lockedSettings);
      setRateLimitState(null);
      setToolLimitReached(false);
      invalidateCompactionUndo();
    },
    [adapter, restoreSettings, invalidateCompactionUndo, clearPendingLock],
  );

  // Bootstrap a client from the restored history (mirrors handleSend's first-
  // send path). Synced into bootstrapClientRef so compaction — created above,
  // before initializeChat — can reach it without a forward reference.
  const bootstrapClient = useCallback(async () => {
    const pendingHistory = pendingHistoryRef.current;

    if (!pendingHistory || !apiKey) return;

    await initializeChat(pendingHistory);
    // The client owns the restored history now (init baked it in), so drop the
    // fallback. Deferred until after init, same as the send and fork paths: a
    // thrown init (MCP down, unusable provider config) leaves it intact so the
    // conversation is still there for the next send. Nulling it up front left
    // that send nothing to continue from, and it persisted the empty start.
    pendingHistoryRef.current = null;
  }, [apiKey, initializeChat]);

  useEffect(() => {
    bootstrapClientRef.current = bootstrapClient;
  }, [bootstrapClient]);

  const runWithChat = useCallback(
    async <T>(
      fn: (stillCurrent: () => boolean) => Promise<T>,
      userMessage?: TMessage,
    ): Promise<T | undefined> =>
      await runChatTurn(fn, userMessage, {
        adapter,
        clientRef,
        pendingHistoryRef,
        abortControllerRef,
        autoSaveRef,
        pendingForkRef,
        turnIdRef,
        conversationGenRef,
        pendingUserMessageRef,
        setMessages,
        setIsAssistantResponding,
        setToolLimitReached,
        setRateLimitState,
      }),
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
            clientRef,
            pendingHistoryRef,
          );

          return;
        }

        const userMessageEntry = adapter.createUserMessage(userMessage);
        const sendOptions = currentOptions;

        const succeeded = await runWithChat(async (stillCurrent) => {
          // Taken before setup so Stop can reach this turn while it is parked in
          // the connect below — see beginTurn. Both parking points need it: this
          // turn's own connect, and another turn's connect that this one adopts.
          const { controller, stillLive } = beginTurn(
            abortControllerRef,
            stillCurrent,
          );

          if (!clientRef.current) {
            await initializeChat(
              pendingHistoryRef.current ?? undefined,
              sendOptions,
              stillLive,
            );
          } else if (pendingInitRef.current) {
            // A client is here but another turn is still connecting it — the
            // user stopped that turn mid-connect (which re-enables the composer)
            // and re-sent. Adopt the client, but wait for its connect: streaming
            // now would send before the MCP tool catalog has landed.
            await pendingInitRef.current;
          }

          // Stopped or superseded while setting up. Superseded: the user stopped
          // this turn mid-connect (which re-enables the composer) and re-sent, so
          // the newer turn owns the client's stream now — two turns streaming into
          // one chatHistory interleave, and both paint and autosave. Stopped: the
          // user is done with this turn, or switched conversations out from under
          // it. Bailing here is also what keeps a switch from reaching the throw
          // below, whose error recovery would overwrite the conversation the user
          // just switched TO with this turn's stray message.
          if (!stillLive()) return false;

          const client = clientRef.current;

          if (!client) {
            throw new Error("Failed to initialize chat client");
          }

          // The client owns the restored history now (init baked it in), so
          // drop the fallback. Deferred until here, same as a fork: a thrown
          // init leaves it intact so the failure renders the existing
          // conversation instead of replacing it with the message that failed
          // to send — which the teardown autosave would then persist.
          pendingHistoryRef.current = null;

          // This turn is the one that streams, so it owns the lock for the
          // client it's about to use — including one published by an init that
          // was superseded (the adopt branch above never inits, so it would
          // otherwise stream with nothing locked).
          applyPendingLock();

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
            executeStream: () =>
              client.sendMessage(
                userMessage,
                controller.signal,
                filtered,
                shouldInterrupt,
              ),
            resumeStream: () =>
              client.resumeStream(controller.signal, filtered, shouldInterrupt),
            getHistory: () => client.chatHistory,
            stillCurrent,
            stillLive,
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
      applyPendingLock,
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
    applyPendingLock,
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
