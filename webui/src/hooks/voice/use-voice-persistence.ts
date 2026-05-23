// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { mergeVoiceHistory } from "#webui/hooks/voice/use-voice-persistence-helpers";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";
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

const AUTOSAVE_DEBOUNCE_MS = 600;

interface UseVoicePersistenceParams {
  /** Current live voice transcript from useVoiceSession (drives auto-save). */
  liveHistory: RealtimeItem[];
  /** Invoked when a non-voice (chat) record is encountered. The parent (App.tsx)
   * switches modes via viewingMode so the chat hook can pick up the conversation
   * from the URL hash. When omitted, the hook falls back to clearing the active
   * id. */
  onForeignRecord?: (record: ConversationRecord) => void;
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
  deleteAllConversations: () => Promise<void>;
  deleteUnbookmarkedConversations: () => Promise<void>;
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
  const { liveHistory, onForeignRecord } = params;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => getHashId());
  const [savedItems, setSavedItems] = useState<RealtimeItem[]>([]);
  const activeIdRef = useRef(activeConversationId);
  const createdAtRef = useRef<number | null>(null);
  const bookmarkedRef = useRef(false);
  const titleRef = useRef<string | null>(null);
  // Snapshot of the loaded record's full voiceHistory (including function_call
  // items). Used by the auto-save merge so historical tool calls survive a
  // continued session even though the Realtime SDK can't re-seed them.
  const priorItemsRef = useRef<RealtimeItem[]>([]);
  // Ids whose autosave must be abandoned because the record was deleted. A
  // delete can land after the debounce timer has already fired (the in-flight
  // IDB write is no longer cancellable), so the save checks this set right
  // before writing to avoid resurrecting a just-deleted conversation.
  const canceledIdsRef = useRef<Set<string>>(new Set());
  // Id reserved for the in-progress new conversation, before its first save
  // resolves and adopts it as the active id. Generating the id inline in the
  // autosave effect would mint a fresh UUID on every transcript delta that
  // lands in the window between the first save's debounce firing and its async
  // write resolving (activeId still null) — creating a duplicate record. Hold
  // it here so concurrent effect runs reuse the same id. Cleared on navigation.
  const pendingNewIdRef = useRef<string | null>(null);

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
        if (onForeignRecord) onForeignRecord(record);
        else setActiveId(null);

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
      const items = (record.voiceHistory ?? []) as RealtimeItem[];

      priorItemsRef.current = items;
      setSavedItems(items);
    }
  }, [refreshList, setActiveId, onForeignRecord]);

  // Auto-save: debounce so we don't write IDB on every transcript token.
  useEffect(() => {
    if (liveHistory.length === 0) return;

    const id =
      activeIdRef.current ?? (pendingNewIdRef.current ??= crypto.randomUUID());
    const merged = mergeVoiceHistory(priorItemsRef.current, liveHistory);
    const timer = setTimeout(() => {
      void saveVoiceRecord(
        id,
        merged,
        {
          createdAt: createdAtRef.current,
          bookmarked: bookmarkedRef.current,
          title: titleRef.current,
        },
        () => canceledIdsRef.current.has(id),
      ).then((record) => {
        if (!record) return; // deleted while the save was pending/in-flight
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
      pendingNewIdRef.current = null;
      const record = await loadConversation(id);

      if (!record) {
        setActiveId(null);
        setSavedItems([]);
        priorItemsRef.current = [];

        return;
      }

      if (record.sessionType !== "voice") {
        // Foreign record. Update the URL hash to the new id *before* the
        // mode swap so the freshly-mounted chat hook picks it up from the
        // hash on mount.
        if (onForeignRecord) {
          setActiveId(id);
          onForeignRecord(record);
        } else {
          setActiveId(null);
        }

        return;
      }

      createdAtRef.current = record.createdAt;
      bookmarkedRef.current = record.bookmarked;
      titleRef.current = record.title;
      const items = (record.voiceHistory ?? []) as RealtimeItem[];

      priorItemsRef.current = items;
      setSavedItems(items);
      setActiveId(id);
    },
    [setActiveId, onForeignRecord],
  );

  const startNewConversation = useCallback(() => {
    createdAtRef.current = null;
    bookmarkedRef.current = false;
    titleRef.current = null;
    priorItemsRef.current = [];
    pendingNewIdRef.current = null;
    setSavedItems([]);
    setActiveId(null);
  }, [setActiveId]);

  const deleteConversation = useCallback(
    async (id: string) => {
      canceledIdsRef.current.add(id);
      await dbDeleteConversation(id);
      if (activeIdRef.current === id) startNewConversation();
      await refreshList();
    },
    [refreshList, startNewConversation],
  );

  const deleteAllConversations = useCallback(async () => {
    // Cancel the in-flight autosave for the active record OR a not-yet-adopted
    // new conversation (pendingNewIdRef holds its reserved id until the first
    // save resolves and adopts it as the active id). A bulk delete doesn't stop
    // the live session, so a save scheduled before the delete would otherwise
    // resurrect the record.
    const liveId = activeIdRef.current ?? pendingNewIdRef.current;

    if (liveId != null) {
      canceledIdsRef.current.add(liveId);
    }

    await dbDeleteAllConversations();
    startNewConversation();
    await refreshList();
  }, [refreshList, startNewConversation]);

  const deleteUnbookmarkedConversations = useCallback(async () => {
    // The live record (active, or a pending-new one still on its reserved id)
    // is unbookmarked unless explicitly bookmarked, so this bulk delete removes
    // it too. Cancel its in-flight autosave and reset to a fresh session.
    const liveId = activeIdRef.current ?? pendingNewIdRef.current;

    if (liveId != null && !bookmarkedRef.current) {
      canceledIdsRef.current.add(liveId);
      startNewConversation();
    }

    await dbDeleteUnbookmarkedConversations();
    await refreshList();
  }, [refreshList, startNewConversation]);

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
    deleteAllConversations,
    deleteUnbookmarkedConversations,
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
 * @param isCanceled - Returns true if the record was deleted; bail before writing
 * @returns The saved record, or null if the save was canceled
 */
async function saveVoiceRecord(
  id: string,
  items: RealtimeItem[],
  ctx: SaveContext,
  isCanceled: () => boolean,
): Promise<ConversationRecord | null> {
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

  // A delete for this id can land while the debounce was pending or while we
  // awaited the read above. Check as late as possible — right before the write
  // — so a just-deleted conversation isn't resurrected.
  if (isCanceled()) return null;

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
