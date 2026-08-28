// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import {
  type ActiveMeta,
  type ConversationStore,
  type SaveSnapshot,
  createConversationStore,
} from "#webui/lib/conversation-store";
import {
  deriveVoiceTitle,
  mergeVoiceHistory,
} from "#webui/hooks/voice/helpers/use-voice-persistence-helpers";
import { VOICE_AUTOSAVE_DEBOUNCE_MS } from "#webui/lib/constants/autosave";
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
   * live record. The voice layer wires this to stop and reset the live session
   * so a deleted conversation isn't left streaming on screen and re-saved under
   * a fresh id. Unlike the sidebar delete paths, the Settings bulk deletes have
   * no other route to the session controls. */
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
 * The live conversation and its write queue live in the shared conversation
 * store, so voice gets the same two rules chat does: no save may start for a
 * conversation being deleted, and a write whose row has gone is refused by the
 * DB. Voice adds one wrinkle — its saves are debounced, so a save can be
 * scheduled long before it starts. The debounce holds the id it was scheduled
 * for and drops itself if the live conversation has moved on since.
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
  // Snapshot of the loaded record's full voiceHistory (including function_call
  // items). Used by the auto-save merge so historical tool calls survive a
  // continued session even though the Realtime SDK can't re-seed them.
  const priorItemsRef = useRef<RealtimeItem[]>([]);

  const publishActiveId = useCallback((id: string | null) => {
    setActiveConversationId(id);
    setHashId(id);
  }, []);

  const store = useMemo((): ConversationStore => {
    const created = createConversationStore(getHashId());

    created.onActiveIdChange(publishActiveId);

    return created;
  }, [publishActiveId]);

  const refreshList = useCallback(async () => {
    // Pass the active id (as the chat path does) so its branch family is
    // represented by the conversation being viewed, keeping the list highlight
    // on the active sibling.
    setConversations(await listConversations(store.activeId()));
  }, [store]);

  /** Leave the live conversation for a fresh, unsaved one. */
  const startNewConversation = useCallback(() => {
    priorItemsRef.current = [];
    setSavedItems([]);
    setActiveRecordModel(null);
    setActiveRecordProvider(null);
    store.reset();
  }, [store]);

  // Move onto a freshly loaded voice record. Refs and setters are stable, so
  // this callback never changes identity.
  const adoptRecord = useCallback(
    (record: ConversationRecord) => {
      store.adopt(record);
      setActiveRecordModel(record.model ?? null);
      setActiveRecordProvider(record.provider ?? null);
      const items = (record.voiceHistory ?? []) as RealtimeItem[];

      priorItemsRef.current = items;
      setSavedItems(items);
    },
    [store],
  );

  // Initial mount: load active voice record from URL hash, if any
  useEffect(() => {
    void refreshList();
    const hashId = getHashId();

    if (!hashId) return;

    void loadConversation(hashId).then((record) => {
      if (!record) {
        startNewConversation();

        return;
      }

      if (record.sessionType !== "voice") {
        if (onForeignRecord) onForeignRecord(record);
        else startNewConversation();

        return;
      }

      adoptRecord(record);
    });
  }, [refreshList, startNewConversation, onForeignRecord, adoptRecord]);

  // Auto-save: debounce so we don't write IDB on every transcript token.
  useEffect(() => {
    if (liveHistory.length === 0) return undefined;

    // The transcript belongs to whichever conversation is live now. If the user
    // navigates away, or a delete takes it, before the debounce fires, this
    // save is not the new conversation's to make.
    const scheduledFor = store.liveId();
    const merged = mergeVoiceHistory(priorItemsRef.current, liveHistory);
    const timer = setTimeout(() => {
      if (store.liveId() !== scheduledFor) return;

      const snapshot = store.beginSave(false);

      if (!snapshot) return;

      // Copy the metadata now, not inside the queued body: switching or
      // starting a conversation replaces metaRef before the body runs, and this
      // write would then take the incoming conversation's title and createdAt.
      const meta = store.metaRef.current;

      void store.enqueue(async () => {
        try {
          const record = await buildVoiceRecord(snapshot, merged, model, meta);
          const result = await saveConversation(record, {
            expectPersisted: snapshot.expectPersisted,
          });

          // Refused, not failed: the row is gone and the transaction won't
          // write a deleted conversation back. Voice has no banner for it, so
          // the console is where the silence gets broken.
          if (!result.saved) {
            console.warn(
              "This voice conversation is no longer in storage, so nothing more will be saved to it",
            );

            return;
          }

          store.markPersisted(snapshot, record);
          await refreshList();
        } catch (error) {
          // Nothing awaits this save, so report the failure here rather than
          // leaving it an unhandled rejection.
          console.error("Failed to save voice conversation", error);
        }
      });
    }, VOICE_AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [liveHistory, model, refreshList, store]);

  const switchConversation = useCallback(
    async (id: string) => {
      const record = await loadConversation(id);

      if (!record) {
        startNewConversation();

        return;
      }

      if (record.sessionType !== "voice") {
        // Foreign record. Adopting it points the URL hash at the new id *before*
        // the mode swap, so the freshly-mounted chat hook picks it up from the
        // hash. Nothing else here reads a chat record's metadata.
        if (onForeignRecord) {
          store.adopt(record);
          onForeignRecord(record);
        } else {
          startNewConversation();
        }

        return;
      }

      adoptRecord(record);
    },
    [store, startNewConversation, onForeignRecord, adoptRecord],
  );

  const retainPriorHistory = useCallback((items: RealtimeItem[]) => {
    // The ref protects the next autosave merge (read synchronously, so it's in
    // place before the post-reconnect save fires); the state keeps the items on
    // screen via the savedItems → displayItems merge.
    priorItemsRef.current = items;
    setSavedItems(items);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      const isLive = id === store.activeId();
      const undoMark = isLive ? store.markDeleted() : null;

      await store.drain();

      try {
        await dbDeleteConversation(id);
      } catch (error) {
        // The row is still there, so leaving the slot marked would silently
        // stop autosaving the session the user is still in.
        undoMark?.();
        throw error;
      }

      // Ask again rather than trusting isLive: the user can switch conversations
      // while the delete runs, and starting a new one then would throw away the
      // one they just opened. liveId, not activeId — a marked slot reports no
      // active id, so the untouched case has to be recognized by id.
      if (store.liveId() === id) startNewConversation();
      await refreshList();
    },
    [store, refreshList, startNewConversation],
  );

  /**
   * Wipe conversations, taking the live one with them unless it is spared.
   * @param removeRows - Clears the matching rows from the DB
   * @param sparesLive - Whether the live conversation survives this wipe. Asked
   * again after the wipe, because the user can switch conversations while it
   * runs and the answer belongs to whichever one is live at the end.
   */
  const sweep = useCallback(
    async (removeRows: () => Promise<void>, sparesLive: () => boolean) => {
      let undoMark: (() => void) | null = null;

      if (!sparesLive()) {
        // Fire only for a conversation that reached the DB — a session with
        // nothing saved yet has no record to lose. Ask before marking: a marked
        // slot reports no active id.
        if (store.activeId() != null) onLiveRecordDeleted?.();
        // A bulk delete doesn't stop the live session, so without this the next
        // autosave would write the wiped conversation straight back.
        undoMark = store.markDeleted();
      }

      await store.drain();

      try {
        await removeRows();
      } catch (error) {
        undoMark?.();
        throw error;
      }

      if (!sparesLive()) startNewConversation();
      await refreshList();
    },
    [store, refreshList, startNewConversation, onLiveRecordDeleted],
  );

  const deleteAllConversations = useCallback(
    () => sweep(dbDeleteAllConversations, () => false),
    [sweep],
  );

  const deleteUnbookmarkedConversations = useCallback(
    () =>
      sweep(
        dbDeleteUnbookmarkedConversations,
        () => store.metaRef.current?.bookmarked ?? false,
      ),
    [sweep, store],
  );

  const renameConversation = useCallback(
    async (id: string, title: string | null) => {
      await dbRenameConversation(id, title);

      if (id === store.activeId() && store.metaRef.current) {
        store.metaRef.current.title = title;
      }

      await refreshList();
    },
    [store, refreshList],
  );

  const toggleBookmark = useCallback(
    async (id: string) => {
      const conv = conversations.find((c) => c.id === id);

      if (!conv) return;
      const next = !conv.bookmarked;

      await setBookmark(id, next);

      if (id === store.activeId() && store.metaRef.current) {
        store.metaRef.current.bookmarked = next;
      }

      await refreshList();
    },
    [store, conversations, refreshList],
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

      if (hashId === store.activeId()) return;
      if (hashId) void switchConversation(hashId);
      else startNewConversation();
    };

    window.addEventListener("hashchange", handler);

    return () => window.removeEventListener("hashchange", handler);
  }, [store, switchConversation, startNewConversation]);

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

/**
 * Build the record a voice autosave writes.
 * @param snapshot - What the store stamped when the save started
 * @param items - Merged RealtimeItem history to persist
 * @param model - Realtime model id in effect
 * @param meta - The live conversation's metadata, or null before the first save
 * @returns The record to write
 */
async function buildVoiceRecord(
  snapshot: SaveSnapshot,
  items: RealtimeItem[],
  model: string,
  meta: ActiveMeta | null,
): Promise<ConversationRecord> {
  const existing =
    snapshot.reuseId == null ? null : await loadConversation(snapshot.reuseId);
  const now = Date.now();

  return {
    id: snapshot.id,
    title: meta?.title ?? deriveVoiceTitle(items),
    createdAt: existing?.createdAt ?? meta?.createdAt ?? now,
    updatedAt: now,
    bookmarked: existing?.bookmarked ?? meta?.bookmarked ?? false,
    // First-write-wins (like createdAt/bookmarked): a record keeps the provider
    // and model it was created with. Provider is derived from the model id (the
    // active backend) so a Gemini voice record isn't mislabeled "OpenAI" in the
    // sidebar/export; continuing it (Stop → Talk) under different current
    // settings must not silently re-stamp the original provider/model/label.
    provider:
      existing?.provider ??
      (isGeminiRealtimeModelId(model) ? "gemini" : "openai"),
    model: existing?.model ?? model,
    modelLabel: existing?.modelLabel ?? model,
    thinking: null,
    smallModelMode: null,
    totalUsage: null,
    sessionType: "voice",
    messages: [],
    voiceHistory: items,
  };
}
