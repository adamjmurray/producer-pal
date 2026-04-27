// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type MutableRef, useCallback } from "preact/hooks";
import {
  type ChatAdapter,
  type ChatClient,
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
  clearQueue: () => void;
}

interface ConversationActionsReturn {
  forkConversation: (
    mergedMessageIndex: number,
    newMessage: string,
  ) => Promise<void>;
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
    clearQueue,
  } = deps;

  const forkConversation = useCallback(
    async (mergedMessageIndex: number, newMessage: string) => {
      if (!apiKey) return;

      clearQueue();

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
    [
      apiKey,
      messages,
      initializeChat,
      runWithChat,
      executeWithRetry,
      clearQueue,
      clientRef,
      pendingHistoryRef,
      abortControllerRef,
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

  return { forkConversation, handleRetry, handleEdit };
}
