// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  type ConversationSummary,
  deleteConversation as dbDeleteConversation,
  listConversations,
  loadConversation,
  renameConversation as dbRenameConversation,
  saveConversation,
  setBookmark,
} from "#webui/lib/conversation-db";

interface UseConversationsProps {
  getChatHistory: () => unknown[];
  restoreChatHistory: (chatHistory: unknown[]) => void;
  clearConversation: () => void;
}

export interface UseConversationsReturn {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  saveCurrentConversation: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  startNewConversation: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string | null) => Promise<void>;
  toggleBookmark: (id: string) => Promise<void>;
}

/**
 * Manages conversation persistence: save, load, switch, and list.
 * Active conversation ID is stored in the URL hash for browser back/forward support.
 * @param props - Chat hook methods for reading/writing conversation state
 * @param props.getChatHistory - Returns current chat history for saving
 * @param props.restoreChatHistory - Loads a saved chat history into the chat hook
 * @param props.clearConversation - Clears the current conversation
 * @returns Conversation management state and handlers
 */
export function useConversations({
  getChatHistory,
  restoreChatHistory,
  clearConversation,
}: UseConversationsProps): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => getHashConversationId());
  const activeIdRef = useRef(activeConversationId);
  const activeTitleRef = useRef<string | null>(null);
  const activeCreatedAtRef = useRef<number | null>(null);
  const activeBookmarkedRef = useRef(false);
  const programmaticHashRef = useRef(false);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

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
    programmaticHashRef.current = true;
    setLocationHash(null);
  }, []);

  // Load conversation from URL hash and conversation list on mount
  useEffect(() => {
    const init = async () => {
      await refreshList();
      const hashId = getHashConversationId();

      if (hashId) {
        const record = await loadConversation(hashId);

        if (record && record.messages.length > 0) {
          setActiveId(hashId);
          restoreChatHistory(record.messages);
          activeTitleRef.current = record.title;
          activeCreatedAtRef.current = record.createdAt;
          activeBookmarkedRef.current = record.bookmarked;
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

    const now = Date.now();
    const isNew = activeIdRef.current == null;
    const id = activeIdRef.current ?? crypto.randomUUID();

    // Set active ID synchronously before any async operations
    setActiveId(id);

    const existing = isNew ? undefined : await loadConversation(id);
    const existingTitle = existing?.title ?? activeTitleRef.current ?? null;
    const title = deriveTitle(existingTitle, chatHistory);
    const createdAt = existing?.createdAt ?? activeCreatedAtRef.current ?? now;
    const bookmarked = existing?.bookmarked ?? activeBookmarkedRef.current;

    activeTitleRef.current = title;
    activeCreatedAtRef.current = createdAt;
    activeBookmarkedRef.current = bookmarked;

    await saveConversation({
      id,
      title,
      createdAt,
      updatedAt: now,
      bookmarked,
      messages: chatHistory as Array<{
        role: "user" | "assistant";
        content: string;
      }>,
    });

    await refreshList();
  }, [getChatHistory, refreshList, setActiveId]);

  const switchConversation = useCallback(
    async (id: string) => {
      // Save current before switching
      if (getChatHistory().length > 0) {
        await saveCurrentConversation();
      }

      const record = await loadConversation(id);

      if (!record) return;

      clearConversation();
      restoreChatHistory(record.messages);
      setActiveId(id);
      activeTitleRef.current = record.title;
      activeCreatedAtRef.current = record.createdAt;
      activeBookmarkedRef.current = record.bookmarked;
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

      const now = Date.now();
      const id = activeIdRef.current ?? crypto.randomUUID();

      // Best-effort save — IndexedDB writes are async but usually complete
      void saveConversation({
        id,
        title: deriveTitle(activeTitleRef.current, chatHistory),
        createdAt: activeCreatedAtRef.current ?? now,
        updatedAt: now,
        bookmarked: activeBookmarkedRef.current,
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
    saveCurrentConversation,
    switchConversation,
    startNewConversation,
    deleteConversation,
    renameConversation,
    toggleBookmark,
  };
}

// --- Helpers below main export ---

/**
 * Read the conversation ID from the URL hash.
 * @returns The conversation ID, or null if no hash is set
 */
function getHashConversationId(): string | null {
  const hash = window.location.hash.slice(1);

  return hash || null;
}

/**
 * Set the URL hash to the given conversation ID (or clear it).
 * @param id - Conversation ID, or null to clear the hash
 */
function setLocationHash(id: string | null): void {
  if (id) {
    window.location.hash = id;
  } else {
    // Remove hash without scrolling — pushState avoids hashchange event issues
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}

const CONNECT_PATTERN =
  /^\s*(connect(\s+to\s+ableton)?|ableton)\s*[!,.:;?]*\s*$/i;

/**
 * Extracts the first line of a message content string.
 * @param content - Raw message content
 * @returns First non-empty line, or the whole string if single-line
 */
function firstLine(content: string): string {
  return content.split("\n")[0]?.trim() ?? "";
}

/**
 * Derives an automatic title from chat history when no manual title exists.
 *
 * Uses the first user message's first line as the title. If that looks like
 * a "connect to Ableton" command, upgrades to the second user message's
 * first line when available.
 * @param currentTitle - Existing title (null if none)
 * @param chatHistory - Current chat messages
 * @returns Derived title, or currentTitle if already set manually
 */
function deriveTitle(
  currentTitle: string | null,
  chatHistory: unknown[],
): string | null {
  const messages = chatHistory as Array<{ role: string; content: string }>;
  const userMessages = messages.filter((m) => m.role === "user");

  if (userMessages.length === 0) return currentTitle;

  const firstUserLine = firstLine(userMessages[0]?.content ?? "");

  // Keep manually-set titles that don't match auto-derived ones
  if (currentTitle != null && !CONNECT_PATTERN.test(currentTitle)) {
    return currentTitle;
  }

  // If first message is a connect command, try second user message
  if (CONNECT_PATTERN.test(firstUserLine) && userMessages.length > 1) {
    return firstLine(userMessages[1]?.content ?? "") || firstUserLine;
  }

  return firstUserLine || null;
}
