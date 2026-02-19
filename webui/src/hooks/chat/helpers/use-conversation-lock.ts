// Producer Pal
// Copyright (C) 2026 Adam Murray
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
  geminiChat: T;
  openaiChat: T;
  responsesChat: T;
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
 * Select the appropriate chat hook based on provider.
 * - gemini: Uses Gemini API
 * - openai, lmstudio: Uses OpenAI Responses API
 * - others: Uses OpenAI Chat Completions API (OpenRouter, Mistral, etc.)
 * @param provider - Current provider
 * @param geminiChat - Gemini chat hook
 * @param openaiChat - OpenAI Chat Completions hook
 * @param responsesChat - OpenAI Responses API hook
 * @returns Selected chat hook
 */
function selectChat<T>(
  provider: Provider,
  geminiChat: T,
  openaiChat: T,
  responsesChat: T,
): T {
  if (provider === "gemini") return geminiChat;
  if (provider === "openai" || provider === "lmstudio") return responsesChat;

  return openaiChat;
}

/**
 * Hook to lock conversation to original provider until explicit reset.
 * Prevents chat reset when changing provider in settings mid-conversation.
 *
 * @param props - Hook configuration
 * @param props.settingsProvider - Current provider from settings
 * @param props.geminiChat - Gemini chat hook result
 * @param props.openaiChat - OpenAI Chat Completions API hook result
 * @param props.responsesChat - OpenAI Responses API hook result
 * @returns Chat and wrapped handlers
 */
export function useConversationLock<T extends ChatHookResult>({
  settingsProvider,
  geminiChat,
  openaiChat,
  responsesChat,
}: UseConversationLockProps<T>): UseConversationLockReturn<T> {
  const [conversationProvider, setConversationProvider] =
    useState<Provider | null>(null);

  const effectiveProvider = conversationProvider ?? settingsProvider;
  const chat = selectChat(
    effectiveProvider,
    geminiChat,
    openaiChat,
    responsesChat,
  );

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
