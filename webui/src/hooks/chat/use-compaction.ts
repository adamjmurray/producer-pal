// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useRef, useState } from "preact/hooks";
import {
  type ChatAdapter,
  type ChatClient,
} from "#webui/hooks/chat/use-chat-types";
import { type UIMessage } from "#webui/types/messages";

interface UseCompactionParams<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  clientRef: { current: TClient | null };
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  autoSaveRef?: { current: (() => void) | null };
  messages: UIMessage[];
  isAssistantResponding: boolean;
  setMessages: (messages: UIMessage[]) => void;
}

interface UseCompactionReturn {
  isCompacting: boolean;
  canUndoCompaction: boolean;
  compact: (mergedMessageIndex: number) => Promise<void>;
  undoCompaction: () => void;
  /** Drop the undo snapshot — called whenever the conversation moves on. */
  invalidateCompactionUndo: () => void;
}

/**
 * Manual conversation compaction: summarize the history up to (and including) a
 * chosen UI message into a single synthetic message and continue from it,
 * dropping everything after the cut. Requires an active client (a conversation
 * that has been sent at least once this session).
 * @param params - Compaction inputs from useChat
 * @param params.clientRef - Ref to the active chat client
 * @param params.adapter - Chat adapter (formats messages, builds the summary message)
 * @param params.autoSaveRef - Ref to the conversation auto-save callback
 * @param params.messages - Current UI messages (used to resolve the cut point)
 * @param params.isAssistantResponding - Whether the assistant is currently responding
 * @param params.setMessages - Setter for the UI messages
 * @returns Compaction state and handlers
 */
export function useCompaction<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>({
  clientRef,
  adapter,
  autoSaveRef,
  messages,
  isAssistantResponding,
  setMessages,
}: UseCompactionParams<TClient, TMessage, TConfig>): UseCompactionReturn {
  const [isCompacting, setIsCompacting] = useState(false);
  const [canUndoCompaction, setCanUndoCompaction] = useState(false);
  const undoRef = useRef<TMessage[] | null>(null);

  // Compaction undo is in-memory and only valid until the next send/reset.
  const invalidateCompactionUndo = useCallback(() => {
    undoRef.current = null;
    setCanUndoCompaction(false);
  }, []);

  // Summarize the conversation up to (and including) the given UI message into a
  // single synthetic message and continue from it. Everything after the cut is
  // dropped — clicking an earlier message both compacts and discards the broken
  // tail (the small-model recovery flow).
  const compact = useCallback(
    async (mergedMessageIndex: number) => {
      if (isCompacting || isAssistantResponding) return;

      const client = clientRef.current;
      const targetMessage = messages[mergedMessageIndex];

      if (!client?.summarize || !targetMessage) return;

      setIsCompacting(true);

      try {
        const history = client.chatHistory;
        const nextMessage = messages[mergedMessageIndex + 1];
        const cutEnd = nextMessage
          ? nextMessage.rawHistoryIndex - 1
          : history.length - 1;
        const toCompact = history.slice(0, cutEnd + 1);

        if (toCompact.length === 0) return;

        const summary = await client.summarize(toCompact);

        undoRef.current = history.slice();
        client.chatHistory = [adapter.createCompactionSummary(summary)];
        setMessages(adapter.formatMessages(client.chatHistory));
        setCanUndoCompaction(true);
        autoSaveRef?.current?.();
      } catch (error) {
        setMessages(
          adapter.createErrorMessage(
            error,
            clientRef.current?.chatHistory ?? [],
          ),
        );
      } finally {
        setIsCompacting(false);
      }
    },
    [
      isCompacting,
      isAssistantResponding,
      messages,
      adapter,
      autoSaveRef,
      clientRef,
      setMessages,
    ],
  );

  const undoCompaction = useCallback(() => {
    const snapshot = undoRef.current;
    const client = clientRef.current;

    if (!snapshot || !client) return;

    client.chatHistory = snapshot;
    undoRef.current = null;
    setCanUndoCompaction(false);
    setMessages(adapter.formatMessages(snapshot));
    autoSaveRef?.current?.();
  }, [adapter, autoSaveRef, clientRef, setMessages]);

  return {
    isCompacting,
    canUndoCompaction,
    compact,
    undoCompaction,
    invalidateCompactionUndo,
  };
}
