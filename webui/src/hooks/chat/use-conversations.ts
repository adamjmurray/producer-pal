// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  type ConversationSummary,
  deleteConversation as dbDeleteConversation,
  listConversations,
  loadConversation as dbLoadConversation,
  renameConversation as dbRenameConversation,
  saveConversation,
} from "#webui/lib/conversation-db";

const ACTIVE_CONVERSATION_KEY = "producer_pal_active_conversation_id";

interface UseConversationsProps {
  getChatHistory: () => unknown[];
  loadConversation: (chatHistory: unknown[]) => void;
  clearConversation: () => void;
}

export interface UseConversationsReturn {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  isPanelOpen: boolean;
  togglePanel: () => void;
  saveCurrentConversation: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  startNewConversation: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string | null) => Promise<void>;
}

/**
 * Manages conversation persistence: save, load, switch, and list.
 * @param props - Chat hook methods for reading/writing conversation state
 * @param props.getChatHistory - Returns current chat history for saving
 * @param props.loadConversation - Loads a saved chat history into the chat hook
 * @param props.clearConversation - Clears the current conversation
 * @returns Conversation management state and handlers
 */
export function useConversations({
  getChatHistory,
  loadConversation,
  clearConversation,
}: UseConversationsProps): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => localStorage.getItem(ACTIVE_CONVERSATION_KEY));
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const activeIdRef = useRef(activeConversationId);
  const activeTitleRef = useRef<string | null>(null);
  const activeCreatedAtRef = useRef<number | null>(null);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const refreshList = useCallback(async () => {
    const list = await listConversations();

    setConversations(list);
  }, []);

  // Load last active conversation and conversation list on mount
  useEffect(() => {
    const init = async () => {
      await refreshList();
      const storedId = localStorage.getItem(ACTIVE_CONVERSATION_KEY);

      if (storedId) {
        const record = await dbLoadConversation(storedId);

        if (record && record.messages.length > 0) {
          loadConversation(record.messages);
          activeTitleRef.current = record.title;
          activeCreatedAtRef.current = record.createdAt;
        } else {
          // Stored ID no longer exists in DB
          localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
          setActiveConversationId(null);
        }
      }
    };

    void init();
  }, [refreshList, loadConversation]);

  const saveCurrentConversation = useCallback(async () => {
    const chatHistory = getChatHistory();

    if (chatHistory.length === 0) return;

    const now = Date.now();
    const isNew = activeIdRef.current == null;
    const id = activeIdRef.current ?? crypto.randomUUID();

    // Set active ID synchronously before any async operations
    activeIdRef.current = id;
    setActiveConversationId(id);
    localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);

    const existing = isNew ? undefined : await dbLoadConversation(id);
    const title = existing?.title ?? activeTitleRef.current ?? null;
    const createdAt = existing?.createdAt ?? activeCreatedAtRef.current ?? now;

    activeTitleRef.current = title;
    activeCreatedAtRef.current = createdAt;

    await saveConversation({
      id,
      title,
      createdAt,
      updatedAt: now,
      messages: chatHistory as Array<{
        role: "user" | "assistant";
        content: string;
      }>,
    });

    await refreshList();
  }, [getChatHistory, refreshList]);

  const switchConversation = useCallback(
    async (id: string) => {
      // Save current before switching
      if (getChatHistory().length > 0) {
        await saveCurrentConversation();
      }

      const record = await dbLoadConversation(id);

      if (!record) return;

      clearConversation();
      loadConversation(record.messages);
      setActiveConversationId(id);
      activeIdRef.current = id;
      activeTitleRef.current = record.title;
      activeCreatedAtRef.current = record.createdAt;
      localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
    },
    [
      getChatHistory,
      saveCurrentConversation,
      clearConversation,
      loadConversation,
    ],
  );

  const startNewConversation = useCallback(async () => {
    if (getChatHistory().length > 0) {
      await saveCurrentConversation();
    }

    clearConversation();
    setActiveConversationId(null);
    activeIdRef.current = null;
    activeTitleRef.current = null;
    activeCreatedAtRef.current = null;
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  }, [getChatHistory, saveCurrentConversation, clearConversation]);

  const deleteConversation = useCallback(
    async (id: string) => {
      await dbDeleteConversation(id);

      if (activeIdRef.current === id) {
        clearConversation();
        setActiveConversationId(null);
        activeIdRef.current = null;
        activeTitleRef.current = null;
        activeCreatedAtRef.current = null;
        localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
      }

      await refreshList();
    },
    [clearConversation, refreshList],
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

  const togglePanel = useCallback(() => {
    setIsPanelOpen((prev) => !prev);
  }, []);

  // Save on beforeunload (best-effort)
  useEffect(() => {
    const handler = () => {
      const chatHistory = getChatHistory();

      if (chatHistory.length === 0) return;

      const now = Date.now();
      const id = activeIdRef.current ?? crypto.randomUUID();

      // Best-effort save — IndexedDB writes are async but usually complete
      void saveConversation({
        id,
        title: activeTitleRef.current,
        createdAt: activeCreatedAtRef.current ?? now,
        updatedAt: now,
        messages: chatHistory as Array<{
          role: "user" | "assistant";
          content: string;
        }>,
      });
    };

    window.addEventListener("beforeunload", handler);

    return () => window.removeEventListener("beforeunload", handler);
  }, [getChatHistory]);

  return {
    conversations,
    activeConversationId,
    isPanelOpen,
    togglePanel,
    saveCurrentConversation,
    switchConversation,
    startNewConversation,
    deleteConversation,
    renameConversation,
  };
}
