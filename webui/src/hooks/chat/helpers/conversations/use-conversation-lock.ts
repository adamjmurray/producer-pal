// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat-types";

interface ChatHookResult {
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  clearConversation: () => void;
}

interface UseConversationLockProps<T extends ChatHookResult> {
  chat: T;
}

interface UseConversationLockReturn<T extends ChatHookResult> {
  chat: T;
  wrappedHandleSend: (
    message: string,
    options?: MessageOverrides,
  ) => Promise<void>;
  wrappedClearConversation: () => void;
}

/**
 * Hook to wrap send and clear handlers with stable callback references.
 * Conversation safety (preserving the client across settings changes) is
 * handled by useChat's clientRef pattern — the client is created on first
 * send and reused until clearConversation resets it.
 *
 * @param props - Hook configuration
 * @param props.chat - Chat hook result
 * @returns Chat and wrapped handlers
 */
export function useConversationLock<T extends ChatHookResult>({
  chat,
}: UseConversationLockProps<T>): UseConversationLockReturn<T> {
  const wrappedHandleSend = useCallback(
    async (message: string, options?: MessageOverrides) => {
      await chat.handleSend(message, options);
    },
    [chat],
  );

  const wrappedClearConversation = useCallback(() => {
    chat.clearConversation();
  }, [chat]);

  return { chat, wrappedHandleSend, wrappedClearConversation };
}
