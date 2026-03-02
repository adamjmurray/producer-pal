// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState, useCallback } from "preact/hooks";
import { type MessageOverrides } from "#webui/hooks/chat/use-chat";
import { type Provider } from "#webui/types/settings";

interface ChatHookResult {
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  clearConversation: () => void;
}

interface UseConversationLockProps<T extends ChatHookResult> {
  settingsProvider: Provider;
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
 * Hook to lock conversation to original provider until explicit reset.
 * Prevents chat reset when changing provider in settings mid-conversation.
 *
 * @param props - Hook configuration
 * @param props.settingsProvider - Current provider from settings
 * @param props.chat - Chat hook result
 * @returns Chat and wrapped handlers
 */
export function useConversationLock<T extends ChatHookResult>({
  settingsProvider,
  chat,
}: UseConversationLockProps<T>): UseConversationLockReturn<T> {
  const [conversationProvider, setConversationProvider] =
    useState<Provider | null>(null);

  const wrappedHandleSend = useCallback(
    async (message: string, options?: MessageOverrides) => {
      if (!conversationProvider) {
        setConversationProvider(settingsProvider);
      }

      await chat.handleSend(message, options);
    },
    [conversationProvider, settingsProvider, chat],
  );

  const wrappedClearConversation = useCallback(() => {
    chat.clearConversation();
    setConversationProvider(null);
  }, [chat]);

  return { chat, wrappedHandleSend, wrappedClearConversation };
}
