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
import { type ConversationLockedSettings } from "#webui/hooks/chat/use-chat-types";
import {
  type ConversationRecord,
  type ConversationSummary,
  deleteConversation as dbDeleteConversation,
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
}

export interface UseConversationsReturn {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  limitNotification: TransferNotificationData | null;
  dismissLimitNotification: () => void;
  saveCurrentConversation: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  startNewConversation: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
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
}: UseConversationsProps): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const limit = useLimitNotification();
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => getHashConversationId());
  const activeIdRef = useRef(activeConversationId);
  const activeMetaRef = useRef<ActiveMeta | null>(null);
  const programmaticHashRef = useRef(false);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Keep active meta in sync with props from useChat
  useEffect(() => {
    activeMetaRef.current ??= { ...DEFAULT_META };

    const meta = activeMetaRef.current;

    if (activeModelProp != null) meta.model = activeModelProp;
    if (activeProviderProp != null) meta.provider = activeProviderProp;
    if (activeThinkingProp != null) meta.thinking = activeThinkingProp;
    if (activeTemperatureProp != null) meta.temperature = activeTemperatureProp;
    if (activeShowThoughtsProp != null)
      meta.showThoughts = activeShowThoughtsProp;
    if (activeSmallModelModeProp != null)
      meta.smallModelMode = activeSmallModelModeProp;
  }, [
    activeModelProp,
    activeProviderProp,
    activeThinkingProp,
    activeTemperatureProp,
    activeShowThoughtsProp,
    activeSmallModelModeProp,
  ]);

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

  /**
   * Sync active metadata from a loaded conversation record.
   * @param record - Conversation record to sync from
   */
  const syncActiveMeta = (record: ConversationRecord) => {
    activeMetaRef.current = {
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
  };

  /**
   * Snapshot active metadata for save record construction.
   * @param id - Conversation ID
   * @returns Active refs snapshot
   */
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
  }, [refreshList, restoreChatHistory, setActiveId, clearActiveId]);

  const saveCurrentConversation = useCallback(async () => {
    const chatHistory = getChatHistory();

    if (chatHistory.length === 0) return;

    const isNew = activeIdRef.current == null;
    const id = activeIdRef.current ?? crypto.randomUUID();

    // Set active ID synchronously before any async operations
    setActiveId(id);

    const existing = isNew ? undefined : await loadConversation(id);
    const record = buildSaveRecord(getActiveRefs(id), existing, chatHistory);

    syncActiveMeta(record);

    const result = await saveConversation(record);

    limit.showLimitNotification(result);
    await refreshList();
  }, [getChatHistory, refreshList, setActiveId, limit]);

  const switchConversation = useCallback(
    async (id: string) => {
      // Save current before switching
      if (getChatHistory().length > 0) {
        await saveCurrentConversation();
      }

      const record = await loadConversation(id);

      if (!record) {
        clearActiveId();

        return;
      }

      clearConversation();
      restoreChatHistory(record.messages, buildLockedSettings(record));
      setActiveId(id);
      syncActiveMeta(record);
    },
    [
      getChatHistory,
      saveCurrentConversation,
      clearConversation,
      clearActiveId,
      restoreChatHistory,
      setActiveId,
    ],
  );

  const startNewConversation = useCallback(async () => {
    if (getChatHistory().length > 0) {
      await saveCurrentConversation();
    }

    clearConversation();
    clearActiveId();
  }, [
    getChatHistory,
    saveCurrentConversation,
    clearConversation,
    clearActiveId,
  ]);

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

  // Save on beforeunload (best-effort)
  useEffect(() => {
    const handler = () => {
      const chatHistory = getChatHistory();

      if (chatHistory.length === 0) return;

      const id = activeIdRef.current ?? crypto.randomUUID();

      // Best-effort save — IndexedDB writes are async but usually complete
      void saveConversation(
        buildSaveRecord(getActiveRefs(id), undefined, chatHistory),
      );
    };

    window.addEventListener("beforeunload", handler);

    return () => window.removeEventListener("beforeunload", handler);
  }, [getChatHistory]);

  return {
    conversations,
    activeConversationId,
    limitNotification: limit.limitNotification,
    dismissLimitNotification: limit.dismissLimitNotification,
    saveCurrentConversation,
    switchConversation,
    startNewConversation,
    deleteConversation,
    renameConversation,
    toggleBookmark,
    refreshList,
  };
}
