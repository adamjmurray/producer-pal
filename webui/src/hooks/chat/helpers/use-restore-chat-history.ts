// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect } from "preact/hooks";
import { type UseInitializeChatReturn } from "#webui/hooks/chat/helpers/use-initialize-chat";
import {
  type ChatAdapter,
  type ChatClient,
  type ConversationLockedSettings,
  type RateLimitState,
} from "#webui/hooks/chat/use-chat-types";
import { type UIMessage } from "#webui/types/messages";

/** What {@link useRestoreChatHistory} needs from the parent chat hook. */
interface UseRestoreChatHistoryDeps<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
> {
  apiKey: string;
  adapter: ChatAdapter<TClient, TMessage, TConfig>;
  clientRef: { current: TClient | null };
  pendingHistoryRef: { current: TMessage[] | null };
  conversationGenRef: { current: number };
  /** Where the bootstrap is published for useCompaction to reach. */
  bootstrapClientRef: { current: (() => Promise<void>) | null };
  initializeChat: UseInitializeChatReturn<TMessage>["initializeChat"];
  clearPendingLock: () => void;
  restoreSettings: (lockedSettings?: ConversationLockedSettings) => void;
  invalidateCompactionUndo: () => void;
  setMessages: (messages: UIMessage[]) => void;
  setRateLimitState: (state: RateLimitState | null) => void;
  setToolLimitReached: (reached: boolean) => void;
}

/** What {@link useRestoreChatHistory} hands back to the parent chat hook. */
interface UseRestoreChatHistoryReturn {
  /** Load a saved conversation's history without connecting a client yet. */
  restoreChatHistory: (
    chatHistory: unknown[],
    lockedSettings?: ConversationLockedSettings,
  ) => void;
}

/**
 * Loads a saved conversation and owns the client bootstrap that goes with it:
 * the history stays pending until the first send, or until compaction asks for
 * a client through `bootstrapClientRef`.
 * @param deps - The parent hook's refs, setters, and init handle
 * @returns The restore handler
 */
export function useRestoreChatHistory<
  TClient extends ChatClient<TMessage>,
  TMessage,
  TConfig,
>(
  deps: UseRestoreChatHistoryDeps<TClient, TMessage, TConfig>,
): UseRestoreChatHistoryReturn {
  const {
    apiKey,
    adapter,
    clientRef,
    pendingHistoryRef,
    conversationGenRef,
    bootstrapClientRef,
    initializeChat,
    clearPendingLock,
    restoreSettings,
    invalidateCompactionUndo,
    setMessages,
    setRateLimitState,
    setToolLimitReached,
  } = deps;

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
    [
      adapter,
      restoreSettings,
      invalidateCompactionUndo,
      clearPendingLock,
      clientRef,
      pendingHistoryRef,
      setMessages,
      setRateLimitState,
      setToolLimitReached,
    ],
  );

  // Bootstrap a client from the restored history (mirrors handleSend's first-
  // send path). Synced into bootstrapClientRef so compaction — created before
  // initializeChat — can reach it without a forward reference.
  const bootstrapClient = useCallback(async () => {
    const pendingHistory = pendingHistoryRef.current;

    if (!pendingHistory || !apiKey) {
      return;
    }

    // The connect below takes real network round-trips, and nothing blocks the
    // user from switching conversations during them. Every switch bumps the
    // generation, so this is the same liveness check the send and fork paths
    // make — it just tracks the conversation rather than a turn, since a
    // bootstrap isn't one.
    const conversationGen = conversationGenRef.current;
    const stillLive = () => conversationGen === conversationGenRef.current;

    await initializeChat(pendingHistory, undefined, stillLive);

    // Switched while connecting. The refs below belong to the conversation the
    // user moved TO, and this bootstrap has nothing to say about it: nulling
    // its pending history would leave it with no client and nothing to send
    // from, which the teardown autosave then persists over the real thing.
    if (!stillLive()) {
      return;
    }

    // The client owns the restored history now (init baked it in), so drop the
    // fallback. Deferred until after init, same as the send and fork paths: a
    // thrown init (MCP down, unusable provider config) leaves it intact so the
    // conversation is still there for the next send. Nulling it up front left
    // that send nothing to continue from, and it persisted the empty start.
    pendingHistoryRef.current = null;
  }, [apiKey, initializeChat, pendingHistoryRef, conversationGenRef]);

  useEffect(() => {
    bootstrapClientRef.current = bootstrapClient;
  }, [bootstrapClient, bootstrapClientRef]);

  return { restoreChatHistory };
}
