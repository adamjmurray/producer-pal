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
    executeStream: (message: string) => AsyncIterable<TMessage[]>;
    getHistory: () => TMessage[];
    originalMessage: string;
  }) => Promise<boolean>;
  invalidateCompactionUndo: () => void;
  /** Set right before streaming a fork so the next save branches the record. */
  pendingForkRef?: PendingForkRef;
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
  } = deps;

  const forkConversation = useCallback(
    async (
      mergedMessageIndex: number,
      newMessage: string,
      anchorIndex = mergedMessageIndex,
    ) => {
      if (!apiKey) return;

      // Don't discard queued follow-ups on a retry/edit fork — they're the
      // user's words. They stay in the queue (visible) and flush on the next
      // successful send rather than vanishing silently here.
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

        // Signal the branch now that init has succeeded and streaming is about
        // to start: the imminent save consumes it and writes a new sibling
        // record. anchorIndex is where the ‹ n/m › arrows sit — the user message
        // for an edit (its default), or the assistant response for a retry (so
        // the arrows page through alternate responses, not the unchanged
        // prompt). Set here — not before initializeChat — so a failed init never
        // leaves a stale signal for a later normal save.
        if (pendingForkRef) {
          pendingForkRef.current = { anchorIndex };
        }

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
      clientRef,
      pendingHistoryRef,
      abortControllerRef,
      pendingForkRef,
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
