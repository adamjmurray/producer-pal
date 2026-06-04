// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import {
  type ActiveMeta,
  type ActiveRefs,
  DEFAULT_META,
  buildLockedSettings,
  buildSaveRecord,
  getHashConversationId,
  setLocationHash,
} from "#webui/hooks/chat/helpers/use-conversations-helpers";
import { useLimitNotification } from "#webui/hooks/chat/helpers/use-limit-notification";
import { useSyncActiveMeta } from "#webui/hooks/chat/helpers/use-sync-active-meta";
import { type ConversationLockedSettings } from "#webui/hooks/chat/use-chat-types";
import {
  type ConversationRecord,
  type ConversationSummary,
  deleteAllConversations as dbDeleteAllConversations,
  deleteConversation as dbDeleteConversation,
  deleteUnbookmarkedConversations as dbDeleteUnbookmarkedConversations,
  listConversations,
  loadConversation,
  renameConversation as dbRenameConversation,
  saveConversation,
  setBookmark,
} from "#webui/lib/conversation-db";
import { type Provider } from "#webui/types/settings";

interface UseConversationsProps {
  getChatHistory: () => unknown[];
  restoreChatHistory: (
    chatHistory: unknown[],
    lockedSettings?: ConversationLockedSettings,
  ) => void;
  clearConversation: () => void;
  activeModel: string | null;
  activeProvider: Provider | null;
  activeThinking: string | null;
  activeTemperature: number | null;
  activeShowThoughts: boolean | null;
  activeSmallModelMode: boolean | null;
  /** Invoked when a voice record is encountered. The parent should switch
   * modes so the voice hook can pick the conversation up from the URL hash.
   * When omitted, the hook falls back to clearing the active id. */
  onForeignRecord?: (record: ConversationRecord) => void;
}

export interface UseConversationsReturn {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  limitNotification: TransferNotificationData | null;
  dismissLimitNotification: () => void;
  saveCurrentConversation: (updatedAt?: number) => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  deleteAllConversations: () => Promise<void>;
  deleteUnbookmarkedConversations: () => Promise<void>;
  renameConversation: (id: string, title: string | null) => Promise<void>;
  toggleBookmark: (id: string) => Promise<void>;
  refreshList: () => Promise<void>;
}

/**
 * Manages conversation persistence: save, load, switch, and list.
 * Active conversation ID is stored in the URL hash for browser back/forward support.
 * @param props - Chat hook methods for reading/writing conversation state
 * @param props.getChatHistory - Returns current chat history for saving
 * @param props.restoreChatHistory - Loads a saved chat history into the chat hook
 * @param props.clearConversation - Clears the current conversation
 * @param props.activeModel - Active model for the current conversation
 * @param props.activeProvider - Active provider for the current conversation
 * @param props.activeThinking - Active thinking level for the current conversation
 * @param props.activeTemperature - Active temperature for the current conversation
 * @param props.activeShowThoughts - Active showThoughts setting for the current conversation
 * @param props.activeSmallModelMode - Active smallModelMode setting for the current conversation
 * @param props.onForeignRecord - Optional callback invoked when a voice record is encountered; parent should switch modes
 * @returns Conversation management state and handlers
 */
export function useConversations({
  getChatHistory,
  restoreChatHistory,
  clearConversation,
  activeModel: activeModelProp,
  activeProvider: activeProviderProp,
  activeThinking: activeThinkingProp,
  activeTemperature: activeTemperatureProp,
  activeShowThoughts: activeShowThoughtsProp,
  activeSmallModelMode: activeSmallModelModeProp,
  onForeignRecord,
}: UseConversationsProps): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const limit = useLimitNotification();
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => getHashConversationId());
  // activeIdRef is kept in lockstep with state by every setter below
  // (setActiveId / clearActiveId), so no effect-sync is needed.
  const activeIdRef = useRef(activeConversationId);
  const activeMetaRef = useRef<ActiveMeta | null>(null);
  const programmaticHashRef = useRef(false);

  useSyncActiveMeta(activeMetaRef, {
    activeModel: activeModelProp,
    activeProvider: activeProviderProp,
    activeThinking: activeThinkingProp,
    activeTemperature: activeTemperatureProp,
    activeShowThoughts: activeShowThoughtsProp,
    activeSmallModelMode: activeSmallModelModeProp,
  });

  const refreshList = useCallback(async () => {
    const list = await listConversations();

    setConversations(list);
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setActiveConversationId(id);
    activeIdRef.current = id;
    // Only guard if the hash will actually change — setting the same hash
    // doesn't fire hashchange, leaving the flag stuck
    const currentHash = getHashConversationId();

    if (id !== currentHash) {
      programmaticHashRef.current = true;
    }

    setLocationHash(id);
  }, []);

  const clearActiveId = useCallback(() => {
    setActiveConversationId(null);
    activeIdRef.current = null;
    activeMetaRef.current = null;
    // No programmaticHashRef here — setLocationHash(null) uses replaceState
    // which doesn't fire hashchange, so no guard is needed
    setLocationHash(null);
  }, []);

  const syncActiveMeta = (record: ConversationRecord) =>
    syncMetaRef(activeMetaRef, record);
  const getActiveRefs = (id: string): ActiveRefs => ({
    id,
    ...(activeMetaRef.current ?? DEFAULT_META),
  });

  // Load conversation from URL hash and conversation list on mount
  useEffect(() => {
    const init = async () => {
      await refreshList();
      const hashId = getHashConversationId();

      if (hashId) {
        const record = await loadConversation(hashId);

        if (record?.sessionType === "voice") {
          if (onForeignRecord) onForeignRecord(record);
          else clearActiveId();

          return;
        }

        if (record && record.messages.length > 0) {
          setActiveId(hashId);
          restoreChatHistory(record.messages, buildLockedSettings(record));
          syncActiveMeta(record);
        } else {
          // Hash ID no longer exists in DB
          clearActiveId();
        }
      }
    };

    void init();
  }, [
    refreshList,
    restoreChatHistory,
    setActiveId,
    clearActiveId,
    onForeignRecord,
  ]);

  const saveCurrentConversation = useCallback(
    async (updatedAt?: number) => {
      const chatHistory = getChatHistory();

      if (chatHistory.length === 0) return;

      const isNew = activeIdRef.current == null;
      const id = activeIdRef.current ?? crypto.randomUUID();

      // Set active ID synchronously before any async operations
      setActiveId(id);

      try {
        const existing = isNew ? undefined : await loadConversation(id);
        const record = buildSaveRecord(
          getActiveRefs(id),
          existing,
          chatHistory,
          updatedAt,
        );

        syncActiveMeta(record);

        const result = await saveConversation(record);

        limit.showLimitNotification(result);
        await refreshList();
      } catch (error) {
        // App.tsx fire-and-forgets this call, so surface the failure here
        // instead of letting it become an unhandled rejection
        console.error("Failed to save conversation", error);
        limit.showSaveError(error);
      }
    },
    [getChatHistory, refreshList, setActiveId, limit],
  );

  const switchConversation = useCallback(
    async (id: string) => {
      const record = await loadConversation(id);

      if (!record) {
        clearActiveId();

        return;
      }

      if (record.sessionType === "voice") {
        // Voice records can't replay through the chat hook. Hand off to the
        // parent, which switches modes so the voice hook can take over.
        // Update the URL hash to the foreign id *before* the mode swap so
        // the freshly-mounted voice hook picks it up from the hash on mount.
        if (onForeignRecord) {
          setActiveId(id);
          onForeignRecord(record);
        } else clearActiveId();

        return;
      }

      clearConversation();
      restoreChatHistory(record.messages, buildLockedSettings(record));
      setActiveId(id);
      syncActiveMeta(record);
    },
    [
      clearConversation,
      clearActiveId,
      restoreChatHistory,
      setActiveId,
      onForeignRecord,
    ],
  );

  const startNewConversation = useCallback(() => {
    clearConversation();
    clearActiveId();
  }, [clearConversation, clearActiveId]);

  const deleteConversation = useCallback(
    async (id: string) => {
      await dbDeleteConversation(id);

      if (activeIdRef.current === id) {
        clearConversation();
        clearActiveId();
      }

      await refreshList();
    },
    [clearConversation, clearActiveId, refreshList],
  );

  const deleteAllConversations = useCallback(async () => {
    await dbDeleteAllConversations();
    clearConversation();
    clearActiveId();
    await refreshList();
  }, [clearConversation, clearActiveId, refreshList]);

  const deleteUnbookmarkedConversations = useCallback(async () => {
    await dbDeleteUnbookmarkedConversations();

    // Clear active conversation only if it was unbookmarked
    if (activeIdRef.current && !activeMetaRef.current?.bookmarked) {
      clearConversation();
      clearActiveId();
    }

    await refreshList();
  }, [clearConversation, clearActiveId, refreshList]);

  const renameConversation = useCallback(
    async (id: string, title: string | null) => {
      await dbRenameConversation(id, title);

      if (id === activeIdRef.current && activeMetaRef.current) {
        activeMetaRef.current.title = title;
      }

      await refreshList();
    },
    [refreshList],
  );

  const toggleBookmark = useCallback(
    async (id: string) => {
      const conv = conversations.find((c) => c.id === id);

      if (!conv) return;

      const newValue = !conv.bookmarked;

      await setBookmark(id, newValue);

      if (id === activeIdRef.current && activeMetaRef.current) {
        activeMetaRef.current.bookmarked = newValue;
      }

      await refreshList();
    },
    [conversations, refreshList],
  );

  // Handle browser back/forward navigation
  useEffect(() => {
    const handler = () => {
      if (programmaticHashRef.current) {
        programmaticHashRef.current = false;

        return;
      }

      const hashId = getHashConversationId();

      if (hashId === activeIdRef.current) return;

      if (hashId) {
        void switchConversation(hashId);
      } else {
        void startNewConversation();
      }
    };

    window.addEventListener("hashchange", handler);

    return () => window.removeEventListener("hashchange", handler);
  }, [switchConversation, startNewConversation]);

  return {
    conversations,
    activeConversationId,
    limitNotification: limit.limitNotification,
    dismissLimitNotification: limit.dismissLimitNotification,
    saveCurrentConversation,
    switchConversation,
    startNewConversation,
    deleteConversation,
    deleteAllConversations,
    deleteUnbookmarkedConversations,
    renameConversation,
    toggleBookmark,
    refreshList,
  };
}

// --- Helpers below main export ---

/**
 * Overwrite the active-meta ref from a freshly loaded conversation record.
 * @param ref - Ref holding the active-meta object
 * @param ref.current - Mutable slot updated in place
 * @param record - Conversation record to copy metadata from
 */
function syncMetaRef(
  ref: { current: ActiveMeta | null },
  record: ConversationRecord,
): void {
  ref.current = {
    title: record.title,
    createdAt: record.createdAt,
    bookmarked: record.bookmarked,
    model: record.model,
    provider: record.provider as Provider | null,
    thinking: record.thinking,
    temperature: record.temperature,
    showThoughts: record.showThoughts,
    smallModelMode: record.smallModelMode ?? null,
  };
}
