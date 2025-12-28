import { useState, useCallback } from "preact/hooks";
import type { MessageOverrides } from "#webui/hooks/chat/use-chat";
import type { Provider } from "#webui/types/settings";

interface ChatHookResult {
  handleSend: (message: string, options?: MessageOverrides) => Promise<void>;
  clearConversation: () => void;
}

interface UseConversationLockProps<T extends ChatHookResult> {
  settingsProvider: Provider;
  geminiChat: T;
  openaiChat: T;
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
 * @param {UseConversationLockProps} props - Hook configuration
 * @param {Provider} props.settingsProvider - Current provider from settings
 * @param {T} props.geminiChat - Gemini chat hook result
 * @param {T} props.openaiChat - OpenAI chat hook result
 * @returns {UseConversationLockReturn} Chat and wrapped handlers
 */
export function useConversationLock<T extends ChatHookResult>({
  settingsProvider,
  geminiChat,
  openaiChat,
}: UseConversationLockProps<T>): UseConversationLockReturn<T> {
  const [conversationProvider, setConversationProvider] =
    useState<Provider | null>(null);

  const effectiveProvider = conversationProvider ?? settingsProvider;
  const chat = (effectiveProvider === "gemini" ? geminiChat : openaiChat) as T;

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
