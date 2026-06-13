// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  deriveVoiceTitle,
  mergeVoiceHistory,
} from "#webui/hooks/voice/helpers/use-voice-persistence-helpers";
import {
  isGeminiRealtimeModelId,
  OPENAI_REALTIME_MODEL,
} from "#webui/lib/constants/models";
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
  /** Realtime model id to stamp on saved voice records. Defaults to
   * OPENAI_REALTIME_MODEL. */
  model?: string;
  /** Invoked when a non-voice (chat) record is encountered. The parent (App.tsx)
   * switches modes via viewingMode so the chat hook can pick up the conversation
   * from the URL hash. When omitted, the hook falls back to clearing the active
   * id. */
  onForeignRecord?: (record: ConversationRecord) => void;
  /** Invoked when a bulk delete (all / unbookmarked) removes the in-progress
   * live record — the active one, or a pending-new one still on its reserved id.
   * The voice layer wires this to stop and reset the live session so a deleted
   * conversation isn't left streaming on screen and re-saved under a fresh id.
   * Unlike the sidebar delete paths, the Settings bulk deletes have no other
   * route to the session controls. */
  onLiveRecordDeleted?: () => void;
}

export interface UseVoicePersistenceReturn {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  /** Realtime model of the currently-loaded saved record, or null for a fresh
   * (unsaved) session. Lets the header lock show the model the conversation was
   * recorded with rather than the current-settings model when viewing or
   * continuing a saved conversation. */
  activeRecordModel: string | null;
  /** Provider stored on the currently-loaded saved record, or null for a fresh
   * session. Drives record-aware voice routing — a loaded Gemini record resumes
   * on the Gemini backend even when current settings select OpenAI (and vice
   * versa), instead of mounting the wrong backend with a missing-key state. */
  activeRecordProvider: string | null;
  /** Items to render when no live session is producing transcript (saved record). */
  savedItems: RealtimeItem[];
  /** Promote the given items (typically the full displayed transcript) into the
   * prior-history snapshot used by the autosave merge and the read-only view.
   * Called at the Stop → Talk boundary: the realtime reseed drops function_call
   * items, so without this a same-sitting reconnect would merge against an empty
   * prior and overwrite the saved record's historical tool calls (and drop them
   * from the transcript on screen). */
  retainPriorHistory: (items: RealtimeItem[]) => void;
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
  const {
    liveHistory,
    model = OPENAI_REALTIME_MODEL,
    onForeignRecord,
    onLiveRecordDeleted,
  } = params;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => getHashId());
  const [savedItems, setSavedItems] = useState<RealtimeItem[]>([]);
  const [activeRecordModel, setActiveRecordModel] = useState<string | null>(
    null,
  );
  const [activeRecordProvider, setActiveRecordProvider] = useState<
    string | null
  >(null);
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

  // Hydrate refs and saved-items state from a freshly loaded voice record.
  // Refs and setters are stable, so this callback never changes identity.
  const adoptRecord = useCallback((record: ConversationRecord) => {
    createdAtRef.current = record.createdAt;
    bookmarkedRef.current = record.bookmarked;
    titleRef.current = record.title;
    setActiveRecordModel(record.model ?? null);
    setActiveRecordProvider(record.provider ?? null);
    const items = (record.voiceHistory ?? []) as RealtimeItem[];

    priorItemsRef.current = items;
    setSavedItems(items);
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
  }, [refreshList, setActiveId, onForeignRecord, adoptRecord]);

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
          model,
        },
        () => canceledIdsRef.current.has(id),
      ).then((record) => {
        if (!record) return; // deleted while the save was pending/in-flight
        // A delete can also land after saveVoiceRecord's pre-write check but
        // during its await: the record gets written, then the delete removes
        // it (the on-disk delete wins). Re-check here so we don't adopt a
        // just-deleted id and leave a stale hash pointing at an empty list.
        if (canceledIdsRef.current.has(id)) return;
        createdAtRef.current = record.createdAt;
        titleRef.current = record.title;

        // Adopt the freshly-reserved id only if we're still on this pending-new
        // conversation. If the user clicked New or selected a foreign record
        // while this first save was in flight, navigation cleared/replaced
        // pendingNewIdRef (and set activeId to null or the foreign id) — re-
        // asserting `id` here would point the hash at an abandoned record while
        // the screen shows another. The plain `activeIdRef.current !== id`
        // check couldn't tell adoption from that stale-id race.
        if (activeIdRef.current == null && pendingNewIdRef.current === id) {
          setActiveId(id);
        }

        void refreshList();
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [liveHistory, model, refreshList, setActiveId]);

  const switchConversation = useCallback(
    async (id: string) => {
      pendingNewIdRef.current = null;
      const record = await loadConversation(id);

      if (!record) {
        setActiveId(null);
        setSavedItems([]);
        setActiveRecordModel(null);
        setActiveRecordProvider(null);
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

      adoptRecord(record);
      setActiveId(id);
    },
    [setActiveId, onForeignRecord, adoptRecord],
  );

  const startNewConversation = useCallback(() => {
    createdAtRef.current = null;
    bookmarkedRef.current = false;
    titleRef.current = null;
    priorItemsRef.current = [];
    pendingNewIdRef.current = null;
    setSavedItems([]);
    setActiveRecordModel(null);
    setActiveRecordProvider(null);
    setActiveId(null);
  }, [setActiveId]);

  const retainPriorHistory = useCallback((items: RealtimeItem[]) => {
    // The ref protects the next autosave merge (read synchronously, so it's in
    // place before the post-reconnect save fires); the state keeps the items on
    // screen via the savedItems → displayItems merge.
    priorItemsRef.current = items;
    setSavedItems(items);
  }, []);

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
      onLiveRecordDeleted?.();
    }

    await dbDeleteAllConversations();
    startNewConversation();
    await refreshList();
  }, [refreshList, startNewConversation, onLiveRecordDeleted]);

  const deleteUnbookmarkedConversations = useCallback(async () => {
    // The live record (active, or a pending-new one still on its reserved id)
    // is unbookmarked unless explicitly bookmarked, so this bulk delete removes
    // it too. Cancel its in-flight autosave and reset to a fresh session.
    const liveId = activeIdRef.current ?? pendingNewIdRef.current;

    if (liveId != null && !bookmarkedRef.current) {
      canceledIdsRef.current.add(liveId);
      onLiveRecordDeleted?.();
      startNewConversation();
    }

    await dbDeleteUnbookmarkedConversations();
    await refreshList();
  }, [refreshList, startNewConversation, onLiveRecordDeleted]);

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

  // Handle browser Back/Forward: re-route to whatever conversation the URL hash
  // now points at. Without this the voice page ignores history navigation, so a
  // chat→voice handoff left a hash entry that desynced from the screen on Back.
  // setHashId() uses replaceState (which fires no hashchange), so every event
  // here is a genuine user navigation — no programmatic-set guard is needed
  // (unlike the chat hook). switchConversation already hands foreign (chat)
  // records back to App via onForeignRecord.
  useEffect(() => {
    const handler = () => {
      const hashId = getHashId();

      if (hashId === activeIdRef.current) return;
      if (hashId) void switchConversation(hashId);
      else startNewConversation();
    };

    window.addEventListener("hashchange", handler);

    return () => window.removeEventListener("hashchange", handler);
  }, [switchConversation, startNewConversation]);

  return {
    conversations,
    activeConversationId,
    activeRecordModel,
    activeRecordProvider,
    savedItems,
    retainPriorHistory,
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
  model: string;
}

/**
 * Persist the current live voice transcript under the given conversation id.
 * @param id - Conversation id (existing or freshly generated)
 * @param items - Live RealtimeItem history
 * @param ctx - Snapshot of metadata refs (createdAt, bookmarked, title, model)
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
    // First-write-wins (like createdAt/bookmarked): a record keeps the provider
    // and model it was created with. Provider is derived from the model id (the
    // active backend) so a Gemini voice record isn't mislabeled "OpenAI" in the
    // sidebar/export; continuing it (Stop → Talk) under different current
    // settings must not silently re-stamp the original provider/model/label.
    provider:
      existing?.provider ??
      (isGeminiRealtimeModelId(ctx.model) ? "gemini" : "openai"),
    model: existing?.model ?? ctx.model,
    modelLabel: existing?.modelLabel ?? ctx.model,
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
