// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type RealtimeItem } from "@openai/agents/realtime";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import { useLimitNotification } from "#webui/hooks/chat/helpers/notifications/use-limit-notification";
import { type UndoDeleteReturn } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import { type ConversationListActions } from "#webui/hooks/chat/use-conversations";
import {
  deleteOneConversation,
  renameStoredConversation,
  toggleStoredBookmark,
} from "#webui/lib/conversations/conversation-edits";
import {
  type ConversationStore,
  createConversationStore,
} from "#webui/lib/conversations/conversation-store";
import { useVoiceBulkDeletes } from "#webui/hooks/voice/helpers/use-voice-bulk-deletes";
import {
  buildVoiceRecord,
  mergeVoiceHistory,
} from "#webui/hooks/voice/helpers/voice-record";
import { VOICE_AUTOSAVE_DEBOUNCE_MS } from "#webui/lib/constants/autosave";
import { OPENAI_REALTIME_MODEL } from "#webui/lib/constants/models";
import {
  type ConversationRecord,
  type ConversationSummary,
  listConversations,
  loadConversation,
  saveConversation,
} from "#webui/lib/conversation-db";

interface UseVoicePersistenceParams {
  /** Current live voice transcript from useVoiceSession (drives auto-save). */
  liveHistory: RealtimeItem[];
  /** Realtime model id to stamp on saved voice records (default OPENAI_REALTIME_MODEL). */
  model?: string;
  /** Invoked on a chat record, so the parent switches modes and the chat hook
   * picks it up from the URL hash. Omitted: the active id is cleared. */
  onForeignRecord?: (record: ConversationRecord) => void;
  /** Invoked when a Settings bulk delete removes the live record, so the voice
   * layer stops the session instead of streaming and re-saving a deleted
   * conversation. Those deletes have no other route to the session controls. */
  onLiveRecordDeleted?: () => void;
  /** App-owned undo stack. Voice deletes snapshot through it so the sidebar's
   * delete control is as recoverable here as it is in chat. */
  undoDelete: UndoDeleteReturn;
}

export interface UseVoicePersistenceReturn extends ConversationListActions {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  /** Banner for a refused or failed autosave. Named like useLimitNotification's
   * so chat's resolvePanelNotification can rank it against the undo banner. */
  limitNotification: TransferNotificationData | null;
  dismissLimitNotification: () => void;
  /** Realtime model of the loaded saved record (null when unsaved), so the
   * header lock shows the model it was recorded with, not the current one. */
  activeRecordModel: string | null;
  /** Provider of the loaded saved record (null when unsaved). A record resumes
   * on its own backend whatever the current settings select. */
  activeRecordProvider: string | null;
  /** Items to render when no live session is producing transcript (saved record). */
  savedItems: RealtimeItem[];
  /** Make these items (usually the displayed transcript) the prior history the
   * autosave merges against. Called at Stop → Talk: the realtime reseed drops
   * function_call items, so a reconnect would otherwise overwrite the saved
   * record's tool calls. */
  retainPriorHistory: (items: RealtimeItem[]) => void;
}

/**
 * Persistence layer for the voice page: lists conversations, auto-saves the
 * live transcript, and resolves the active voice record so a finished session
 * can still be viewed read-only. Text records selected from the sidebar
 * navigate to /chat — the chat hook owns those.
 *
 * The shared conversation store gives voice chat's two rules: no save starts
 * for a conversation being deleted, and the DB refuses a write whose row is
 * gone. Voice saves are debounced, so each holds the id it was scheduled for
 * and drops itself if the live conversation has moved on.
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
    undoDelete,
  } = params;
  const limit = useLimitNotification();
  // Destructured: `limit` is a fresh object every render, and depending on it
  // would restart the autosave debounce each time.
  const { showSaveRefused, showSaveError, retireSaveRefused } = limit;
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
  // The loaded record's full voiceHistory, function_call items included, so the
  // autosave merge keeps tool calls the Realtime SDK can't re-seed.
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

  // The refusal stands until dismissed, which is right while the user is still
  // in that conversation and wrong once they leave it. Same as the chat path.
  useEffect(() => {
    retireSaveRefused();
  }, [activeConversationId, retireSaveRefused]);

  // Undo restores into whichever mode is mounted, so hand it this one's list
  // refresher for as long as voice is the mounted mode.
  useEffect(() => {
    undoDelete.setRefreshList(refreshList);
  }, [undoDelete, refreshList]);

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

    if (!hashId) {
      return;
    }

    void loadConversation(hashId).then((record) => {
      if (!record) {
        startNewConversation();

        return;
      }

      if (record.sessionType !== "voice") {
        if (onForeignRecord) {
          onForeignRecord(record);
        } else {
          startNewConversation();
        }

        return;
      }

      adoptRecord(record);
    });
  }, [refreshList, startNewConversation, onForeignRecord, adoptRecord]);

  // Auto-save: debounce so we don't write IDB on every transcript token.
  useEffect(() => {
    if (liveHistory.length === 0) {
      return undefined;
    }

    // The transcript belongs to whichever conversation is live now. If the user
    // navigates away, or a delete takes it, before the debounce fires, this
    // save is not the new conversation's to make.
    const scheduledFor = store.liveId();
    const merged = mergeVoiceHistory(priorItemsRef.current, liveHistory);
    const timer = setTimeout(() => {
      if (store.liveId() !== scheduledFor) {
        return;
      }

      const snapshot = store.beginSave(false);

      if (!snapshot) {
        return;
      }

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
          // write a deleted conversation back. Nothing more will ever be saved
          // to this conversation, and the user is still talking into it, so it
          // has to say so on screen — a console warning is not user-visible.
          // Unless they have since left, in which case the banner would land on
          // whatever they moved to, which saves fine.
          if (!result.saved) {
            if (snapshot.id === store.activeId()) {
              showSaveRefused();
            }

            return;
          }

          store.markPersisted(snapshot, record);
          await refreshList();
        } catch (error) {
          // Nothing awaits this save, so report the failure here rather than
          // leaving it an unhandled rejection.
          console.error("Failed to save voice conversation", error);
          showSaveError(error);
        }
      });
    }, VOICE_AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [liveHistory, model, refreshList, showSaveError, showSaveRefused, store]);

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
    (id: string) =>
      deleteOneConversation({
        store,
        id,
        deleteWithUndo: undoDelete.deleteWithUndo,
        refreshList,
        onLiveGone: startNewConversation,
      }),
    [store, refreshList, startNewConversation, undoDelete],
  );

  const { deleteAllConversations, deleteUnbookmarkedConversations } =
    useVoiceBulkDeletes({
      store,
      refreshList,
      startNewConversation,
      onLiveRecordDeleted,
      undoDelete,
    });

  const renameConversation = useCallback(
    (id: string, title: string | null) =>
      renameStoredConversation(store, refreshList, id, title),
    [store, refreshList],
  );

  const toggleBookmark = useCallback(
    (id: string) => toggleStoredBookmark(store, refreshList, conversations, id),
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

      if (hashId === store.activeId()) {
        return;
      }

      if (hashId) {
        void switchConversation(hashId);
      } else {
        startNewConversation();
      }
    };

    window.addEventListener("hashchange", handler);

    return () => window.removeEventListener("hashchange", handler);
  }, [store, switchConversation, startNewConversation]);

  return {
    conversations,
    activeConversationId,
    limitNotification: limit.limitNotification,
    dismissLimitNotification: limit.dismissLimitNotification,
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
