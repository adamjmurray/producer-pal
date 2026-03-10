// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import {
  type ActiveRefs,
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
}: UseConversationsProps): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const limit = useLimitNotification();
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => getHashConversationId());
  const activeIdRef = useRef(activeConversationId);
  const activeTitleRef = useRef<string | null>(null);
  const activeCreatedAtRef = useRef<number | null>(null);
  const activeBookmarkedRef = useRef(false);
  const activeModelRef = useRef<string | null>(null);
  const activeProviderRef = useRef<Provider | null>(null);
  const activeThinkingRef = useRef<string | null>(null);
  const activeTemperatureRef = useRef<number | null>(null);
  const activeShowThoughtsRef = useRef<boolean | null>(null);
  const programmaticHashRef = useRef(false);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Keep active refs in sync with props from useChat
  useEffect(() => {
    if (activeModelProp != null) activeModelRef.current = activeModelProp;
    if (activeProviderProp != null)
      activeProviderRef.current = activeProviderProp;
    if (activeThinkingProp != null)
      activeThinkingRef.current = activeThinkingProp;
    if (activeTemperatureProp != null)
      activeTemperatureRef.current = activeTemperatureProp;
    if (activeShowThoughtsProp != null)
      activeShowThoughtsRef.current = activeShowThoughtsProp;
  }, [
    activeModelProp,
    activeProviderProp,
    activeThinkingProp,
    activeTemperatureProp,
    activeShowThoughtsProp,
  ]);

  const refreshList = useCallback(async () => {
    const list = await listConversations();

    setConversations(list);
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setActiveConversationId(id);
    activeIdRef.current = id;
    programmaticHashRef.current = true;
    setLocationHash(id);
  }, []);

  const clearActiveId = useCallback(() => {
    setActiveConversationId(null);
    activeIdRef.current = null;
    activeTitleRef.current = null;
    activeCreatedAtRef.current = null;
    activeBookmarkedRef.current = false;
    activeModelRef.current = null;
    activeProviderRef.current = null;
    activeThinkingRef.current = null;
    activeTemperatureRef.current = null;
    activeShowThoughtsRef.current = null;
    programmaticHashRef.current = true;
    setLocationHash(null);
  }, []);

  /**
   * Sync all active refs from a loaded conversation record.
   * @param record - Conversation record to sync from
   */
  const syncActiveRefs = (record: ConversationRecord) => {
    activeTitleRef.current = record.title;
    activeCreatedAtRef.current = record.createdAt;
    activeBookmarkedRef.current = record.bookmarked;
    activeModelRef.current = record.model;
    activeProviderRef.current = record.provider as Provider | null;
    activeThinkingRef.current = record.thinking;
    activeTemperatureRef.current = record.temperature;
    activeShowThoughtsRef.current = record.showThoughts;
  };

  /**
   * Snapshot active refs for save record construction.
   * @param id - Conversation ID
   * @returns Active refs snapshot
   */
  const getActiveRefs = (id: string): ActiveRefs => ({
    id,
    title: activeTitleRef.current,
    createdAt: activeCreatedAtRef.current,
    bookmarked: activeBookmarkedRef.current,
    model: activeModelRef.current,
    provider: activeProviderRef.current,
    thinking: activeThinkingRef.current,
    temperature: activeTemperatureRef.current,
    showThoughts: activeShowThoughtsRef.current,
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
          syncActiveRefs(record);
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

    syncActiveRefs(record);

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

      if (!record) return;

      clearConversation();
      restoreChatHistory(record.messages, buildLockedSettings(record));
      setActiveId(id);
      syncActiveRefs(record);
    },
    [
      getChatHistory,
      saveCurrentConversation,
      clearConversation,
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

      if (id === activeIdRef.current) {
        activeTitleRef.current = title;
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

      if (id === activeIdRef.current) {
        activeBookmarkedRef.current = newValue;
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
