// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type MutableRef, useCallback } from "preact/hooks";
import {
  type ChatAdapter,
  type ChatClient,
  type PendingForkRef,
} from "#webui/hooks/chat/use-chat-types";
import { type UIMessage } from "#webui/types/messages";

interface ConversationActionsDeps<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  apiKey: string;
  messages: UIMessage[];
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  clientRef: MutableRef<TClient | null>;
  pendingHistoryRef: MutableRef<TMessage[] | null>;
  abortControllerRef: MutableRef<AbortController | null>;
  initializeChat: (chatHistory?: TMessage[]) => Promise<void>;
  runWithChat: <T>(
    fn: () => Promise<T>,
    userMessage?: TMessage,
  ) => Promise<T | undefined>;
  executeWithRetry: (args: {
    executeStream: () => AsyncIterable<TMessage[]>;
    resumeStream: () => AsyncIterable<TMessage[]>;
    getHistory: () => TMessage[];
  }) => Promise<boolean>;
  invalidateCompactionUndo: () => void;
  /** Set right before streaming a fork so the next save branches the record. */
  pendingForkRef?: PendingForkRef;
  /** Streaming autosave (saveCurrentConversation). Force-fired after a
   *  content-less successful fork to mint its sibling and consume the fork
   *  signal before queued follow-ups drain. */
  autoSaveRef?: { current: (() => void) | null };
  /** Flush any queued follow-ups through the normal send path. Called after a
   *  successful fork so queued messages don't strand until the next manual send. */
  drainQueuedFollowUps: () => Promise<void>;
}

interface ConversationActionsReturn {
  handleRetry: (mergedMessageIndex: number) => Promise<void>;
  handleEdit: (mergedMessageIndex: number, newMessage: string) => Promise<void>;
}

/**
 * Hook that provides conversation forking, retry, and edit actions.
 * Extracted from useChat to keep file sizes manageable.
 * @param deps - Dependencies from the parent useChat hook
 * @returns Conversation action callbacks
 */
export function useConversationActions<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>(
  deps: ConversationActionsDeps<TClient, TMessage, TConfig>,
): ConversationActionsReturn {
  const {
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
  } = deps;

  const forkConversation = useCallback(
    async (
      mergedMessageIndex: number,
      newMessage: string,
      anchorIndex = mergedMessageIndex,
    ) => {
      if (!apiKey) return;

      // Don't discard queued follow-ups on a retry/edit fork — they're the
      // user's words. They stay queued through the fork and flush afterward (via
      // drainQueuedFollowUps on success), rather than vanishing silently here.
      const message = messages[mergedMessageIndex];

      if (message?.role !== "user") return;

      const rawIndex = message.rawHistoryIndex;
      const history =
        clientRef.current?.chatHistory ?? pendingHistoryRef.current;

      if (!history) return;

      invalidateCompactionUndo();

      const succeeded = await runWithChat(async () => {
        const slicedHistory = history.slice(0, rawIndex);

        // Signal the branch BEFORE initializeChat replaces the client. init
        // builds the new client with slicedHistory baked in, so from that point
        // clientRef holds the truncated history while activeId still points at
        // the source. If init then throws (MCP/network) *after* building the
        // client, runWithChat's catch autosaves — and without the signal already
        // set, that save reuses the source id and overwrites it with the
        // truncated history (data loss). With it set, the save mints a new
        // sibling id and the source survives. The failed-fork autosave consumes
        // the signal, saveCurrentConversation also consumes it before its
        // empty-history early-return, and the chat teardown paths
        // (stopResponse/clearConversation) clear it on abort. When init throws
        // *before* a client exists — forking a restored conversation while MCP
        // is down — no autosave runs at all, so runWithChat's catch drops the
        // signal directly. Either way a fork that streams no content can't
        // linger and mis-branch a later, unrelated save. anchorIndex is where
        // the ‹ n/m › arrows sit — the user message for an edit (its default),
        // or the assistant response for a retry (so the arrows page through
        // alternate responses, not the unchanged prompt).
        if (pendingForkRef) {
          pendingForkRef.current = { anchorIndex };
        }

        await initializeChat(slicedHistory);

        // Init succeeded, so the new client now owns the (truncated) history;
        // clear the restored-conversation fallback. Deferred until after init
        // on purpose: a thrown init leaves pendingHistoryRef intact so the
        // runWithChat catch renders the restored conversation instead of an
        // empty view (and a later send can still bootstrap from it).
        pendingHistoryRef.current = null;

        const client = clientRef.current as NonNullable<
          typeof clientRef.current
        >;

        const controller = new AbortController();

        abortControllerRef.current = controller;

        return await executeWithRetry({
          executeStream: () =>
            client.sendMessage(newMessage, controller.signal),
          resumeStream: () => client.resumeStream(controller.signal),
          getHistory: () => client.chatHistory,
        });
      });

      // Only flush queued follow-ups when the fork actually streamed a response.
      // A failed/aborted fork (runWithChat catch -> undefined, or a false retry
      // result) leaves the queue intact to flush on a later send.
      if (succeeded === true) {
        // A successful fork that streamed zero assistant content AND recorded no
        // usage never fired the streaming autosave, so pendingForkRef is still
        // set and the forked turn was never persisted. Force the save now: it
        // consumes the fork signal synchronously (saveCurrentConversation clears
        // it before any async work) and mints the content-less turn as its own
        // sibling. Without this, drainQueuedFollowUps below sends the follow-up,
        // whose autosave inherits the lingering signal and mis-branches under it
        // instead of appending to the fork.
        if (pendingForkRef?.current != null) autoSaveRef?.current?.();
        await drainQueuedFollowUps();
      }
    },
    [
      apiKey,
      messages,
      initializeChat,
      runWithChat,
      executeWithRetry,
      invalidateCompactionUndo,
      clientRef,
      pendingHistoryRef,
      abortControllerRef,
      pendingForkRef,
      autoSaveRef,
      drainQueuedFollowUps,
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

      // Retry forks like an edit, but anchors the ‹ n/m › arrows under the
      // assistant response (mergedMessageIndex + 1) rather than the user message:
      // the prompt is unchanged across retries, only the response varies. One
      // assistant turn is a single UIMessage, so +1 is always that response.
      await forkConversation(
        mergedMessageIndex,
        userMessage,
        mergedMessageIndex + 1,
      );
    },
    [messages, adapter, forkConversation, clientRef, pendingHistoryRef],
  );

  const handleEdit = useCallback(
    async (mergedMessageIndex: number, newMessage: string) => {
      const trimmed = newMessage.trim();

      if (!trimmed) return;

      await forkConversation(mergedMessageIndex, trimmed);
    },
    [forkConversation],
  );

  // forkConversation is intentionally not exported: it's the lower-level
  // primitive that handleRetry/handleEdit wrap with the correct anchor. Callers
  // should go through those so the ‹ n/m › arrows always anchor consistently.
  return { handleRetry, handleEdit };
}
