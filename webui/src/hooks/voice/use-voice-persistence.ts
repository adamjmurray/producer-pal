// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";
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

const AUTOSAVE_DEBOUNCE_MS = 600;

interface UseVoicePersistenceParams {
  /** Current live voice transcript from useVoiceSession (drives auto-save). */
  liveHistory: RealtimeItem[];
}

export interface UseVoicePersistenceReturn {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  /** Items to render when no live session is producing transcript (saved record). */
  savedItems: RealtimeItem[];
  refreshList: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string | null) => Promise<void>;
  toggleBookmark: (id: string) => Promise<void>;
}

/**
 * Persistence layer for the voice page: lists conversations, auto-saves the
 * live transcript, and resolves the active voice record so a finished session
 * can still be viewed read-only. Text records selected from the sidebar
 * navigate to /chat — the chat hook owns those.
 *
 * @param params - hook parameters
 * @param params.liveHistory - Live voice transcript from useVoiceSession
 * @returns Voice conversation state and handlers
 */
export function useVoicePersistence(
  params: UseVoicePersistenceParams,
): UseVoicePersistenceReturn {
  const { liveHistory } = params;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => getHashId());
  const [savedItems, setSavedItems] = useState<RealtimeItem[]>([]);
  const activeIdRef = useRef(activeConversationId);
  const createdAtRef = useRef<number | null>(null);
  const bookmarkedRef = useRef(false);
  const titleRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const refreshList = useCallback(async () => {
    setConversations(await listConversations());
  }, []);

  const setActiveId = useCallback((id: string | null) => {
    setActiveConversationId(id);
    activeIdRef.current = id;
    setHashId(id);
  }, []);

  // Initial mount: load active voice record from URL hash, if any
  useEffect(() => {
    void refreshList();
    const hashId = getHashId();

    if (!hashId) return;

    void loadConversation(hashId).then((record) => {
      if (!record) {
        setActiveId(null);

        return;
      }

      if (record.sessionType !== "voice") {
        window.location.href = `/chat#${hashId}`;

        return;
      }

      adoptRecord(record);
    });

    /**
     * Hydrate refs and saved-items state from a freshly loaded voice record.
     * @param record - The conversation record to adopt
     */
    function adoptRecord(record: ConversationRecord) {
      createdAtRef.current = record.createdAt;
      bookmarkedRef.current = record.bookmarked;
      titleRef.current = record.title;
      setSavedItems((record.voiceHistory ?? []) as RealtimeItem[]);
    }
  }, [refreshList, setActiveId]);

  // Auto-save: debounce so we don't write IDB on every transcript token.
  useEffect(() => {
    if (liveHistory.length === 0) return;

    const id = activeIdRef.current ?? crypto.randomUUID();
    const timer = setTimeout(() => {
      void saveVoiceRecord(id, liveHistory, {
        createdAt: createdAtRef.current,
        bookmarked: bookmarkedRef.current,
        title: titleRef.current,
      }).then((record) => {
        createdAtRef.current = record.createdAt;
        titleRef.current = record.title;
        if (activeIdRef.current !== id) setActiveId(id);
        void refreshList();
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [liveHistory, refreshList, setActiveId]);

  const switchConversation = useCallback(
    async (id: string) => {
      const record = await loadConversation(id);

      if (!record) {
        setActiveId(null);
        setSavedItems([]);

        return;
      }

      if (record.sessionType !== "voice") {
        window.location.href = `/chat#${id}`;

        return;
      }

      createdAtRef.current = record.createdAt;
      bookmarkedRef.current = record.bookmarked;
      titleRef.current = record.title;
      setSavedItems((record.voiceHistory ?? []) as RealtimeItem[]);
      setActiveId(id);
    },
    [setActiveId],
  );

  const startNewConversation = useCallback(() => {
    createdAtRef.current = null;
    bookmarkedRef.current = false;
    titleRef.current = null;
    setSavedItems([]);
    setActiveId(null);
  }, [setActiveId]);

  const deleteConversation = useCallback(
    async (id: string) => {
      await dbDeleteConversation(id);
      if (activeIdRef.current === id) startNewConversation();
      await refreshList();
    },
    [refreshList, startNewConversation],
  );

  const renameConversation = useCallback(
    async (id: string, title: string | null) => {
      await dbRenameConversation(id, title);
      if (activeIdRef.current === id) titleRef.current = title;
      await refreshList();
    },
    [refreshList],
  );

  const toggleBookmark = useCallback(
    async (id: string) => {
      const conv = conversations.find((c) => c.id === id);

      if (!conv) return;
      const next = !conv.bookmarked;

      await setBookmark(id, next);
      if (activeIdRef.current === id) bookmarkedRef.current = next;
      await refreshList();
    },
    [conversations, refreshList],
  );

  return {
    conversations,
    activeConversationId,
    savedItems,
    refreshList,
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
function getHashId(): string | null {
  return window.location.hash.slice(1) || null;
}

/**
 * Update the URL hash to reflect the active conversation, without scrolling.
 * @param id - Conversation ID, or null to clear
 */
function setHashId(id: string | null): void {
  if (id) {
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${id}`,
    );
  } else {
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}

interface SaveContext {
  createdAt: number | null;
  bookmarked: boolean;
  title: string | null;
}

/**
 * Persist the current live voice transcript under the given conversation id.
 * @param id - Conversation id (existing or freshly generated)
 * @param items - Live RealtimeItem history
 * @param ctx - Snapshot of metadata refs (createdAt, bookmarked, manual title)
 * @returns The saved record
 */
async function saveVoiceRecord(
  id: string,
  items: RealtimeItem[],
  ctx: SaveContext,
): Promise<ConversationRecord> {
  const existing = await loadConversation(id);
  const now = Date.now();
  const title = ctx.title ?? deriveVoiceTitle(items);
  const record: ConversationRecord = {
    id,
    title,
    createdAt: existing?.createdAt ?? ctx.createdAt ?? now,
    updatedAt: now,
    bookmarked: existing?.bookmarked ?? ctx.bookmarked,
    provider: "openai",
    model: OPENAI_REALTIME_MODEL,
    modelLabel: OPENAI_REALTIME_MODEL,
    thinking: null,
    temperature: null,
    showThoughts: null,
    smallModelMode: null,
    totalUsage: null,
    sessionType: "voice",
    messages: [],
    voiceHistory: items,
  };

  await saveConversation(record);

  return record;
}

/**
 * Derive a title from the first user transcript item.
 * @param items - Live RealtimeItem history
 * @returns First user utterance (truncated), or null if none yet
 */
function deriveVoiceTitle(items: RealtimeItem[]): string | null {
  for (const item of items) {
    if (item.type !== "message" || item.role !== "user") continue;
    const text = item.content
      .map((c) => (c.type === "input_text" ? c.text : (c.transcript ?? "")))
      .filter(Boolean)
      .join(" ")
      .trim();

    if (text) return text.slice(0, 80);
  }

  return null;
}
