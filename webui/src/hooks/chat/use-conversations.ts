// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { reconcileDanglingToolCalls } from "#webui/chat/sdk/build-model-messages";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import { useBulkDeletes } from "#webui/hooks/chat/helpers/conversations/use-bulk-deletes";
import { useLimitNotification } from "#webui/hooks/chat/helpers/notifications/use-limit-notification";
import { useUndoDelete } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import {
  buildConversationSaveRecord,
  buildLockedSettings,
  deleteConversationWithSnapshot,
  getHashConversationId,
  resolvePanelNotification,
  setLocationHash,
  useHashNavigation,
} from "#webui/hooks/chat/helpers/conversations/use-conversations-helpers";
import {
  type SyncActiveMetaParams,
  useSyncActiveMeta,
} from "#webui/hooks/chat/helpers/use-sync-active-meta";
import {
  type ConversationStore,
  DEFAULT_META,
  createConversationStore,
} from "#webui/lib/conversation-store";
import {
  type ConversationLockedSettings,
  type PendingForkRef,
} from "#webui/hooks/chat/use-chat-types";
import { branchFamilyIds } from "#webui/lib/conversation-branch-helpers";
import {
  type ConversationRecord,
  type ConversationSummary,
  listAllConversationSummaries,
  listConversations,
  loadConversation,
  renameConversation as dbRenameConversation,
  saveConversation,
  setBookmark,
} from "#webui/lib/conversation-db";

interface UseConversationsProps {
  getChatHistory: () => unknown[];
  restoreChatHistory: (
    chatHistory: unknown[],
    lockedSettings?: ConversationLockedSettings,
  ) => void;
  clearConversation: () => void;
  /**
   * The active conversation's locked metadata (model/provider/thinking/etc. plus
   * the resolved system instruction), mirrored into the store and snapshotted
   * onto saved records.
   */
  activeMeta: SyncActiveMetaParams;
  /** Invoked when a voice record is encountered. The parent should switch
   * modes so the voice hook can pick the conversation up from the URL hash.
   * When omitted, the hook falls back to clearing the active id. */
  onForeignRecord?: (record: ConversationRecord) => void;
  /** Shared signal set by an edit/retry fork; consumed on the next save to
   * branch the conversation into a new record instead of overwriting it. */
  pendingForkRef?: PendingForkRef;
}

export interface UseConversationsReturn {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  /** Active panel notification: an undo-delete banner when one is pending,
   * otherwise the conversation-limit/save-error banner. */
  notification: TransferNotificationData | null;
  dismissNotification: () => void;
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
 *
 * The conversation being edited, its id, and the queue of writes for it all
 * live in a {@link ConversationStore}; this hook is the React surface over it
 * plus the DB calls. Which writes are allowed to land is the store's business —
 * see there for the two questions that decide it.
 *
 * The active conversation ID is mirrored into the URL hash for browser
 * back/forward support.
 * @param props - Chat hook methods for reading/writing conversation state
 * @param props.getChatHistory - Returns current chat history for saving
 * @param props.restoreChatHistory - Loads a saved chat history into the chat hook
 * @param props.clearConversation - Clears the current conversation
 * @param props.activeMeta - Locked conversation metadata (model/provider/etc. + system instruction)
 * @param props.onForeignRecord - Optional callback invoked when a voice record is encountered; parent should switch modes
 * @param props.pendingForkRef - Shared signal consumed on save to branch the conversation into a new record
 * @returns Conversation management state and handlers
 */
export function useConversations({
  getChatHistory,
  restoreChatHistory,
  clearConversation,
  activeMeta,
  onForeignRecord,
  pendingForkRef,
}: UseConversationsProps): UseConversationsReturn {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const limit = useLimitNotification();
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(() => getHashConversationId());
  const programmaticHashRef = useRef(false);

  const publishActiveId = useCallback((id: string | null) => {
    setActiveConversationId(id);

    // Only guard if the hash will actually change — setting the same hash
    // doesn't fire hashchange, leaving the flag stuck. Clearing it goes through
    // replaceState, which doesn't fire hashchange either.
    if (id != null && id !== getHashConversationId()) {
      programmaticHashRef.current = true;
    }

    setLocationHash(id);
  }, []);

  const store = useMemo((): ConversationStore => {
    const created = createConversationStore(getHashConversationId());

    created.onActiveIdChange(publishActiveId);

    return created;
  }, [publishActiveId]);

  useSyncActiveMeta(store.metaRef, activeMeta);

  const refreshList = useCallback(async () => {
    // Pass the active id so its branch family is represented by the conversation
    // being viewed — keeps the sidebar highlight (and bookmark state) on the
    // active sibling even when it isn't the family's most recent member.
    const list = await listConversations(store.activeId());

    setConversations(list);
  }, [store]);

  const undoDelete = useUndoDelete(refreshList);

  const restoreRecord = useCallback(
    (record: ConversationRecord) => {
      // A conversation left mid-tool-call — the tab closed, the page reloaded —
      // is saved with that call still missing its result, because the stream's
      // own reconcile never got to run. Do it here or the card renders as
      // forever "working…" and the next request 400s on the unmatched tool_use.
      // "failed" rather than "canceled": the turn died under the call, nobody
      // stopped it. Same text the wire form already substitutes for this case.
      reconcileDanglingToolCalls(record.messages, 0, "failed");
      restoreChatHistory(record.messages, buildLockedSettings(record));
    },
    [restoreChatHistory],
  );

  // Load conversation from URL hash and conversation list on mount
  useEffect(() => {
    const init = async () => {
      await refreshList();
      const hashId = getHashConversationId();

      if (!hashId) return;

      const record = await loadConversation(hashId);

      if (record?.sessionType === "voice") {
        if (onForeignRecord) onForeignRecord(record);
        else store.reset();

        return;
      }

      if (record && record.messages.length > 0) {
        store.adopt(record);
        restoreRecord(record);
      } else {
        // Hash ID no longer exists in DB
        store.reset();
      }
    };

    void init();
  }, [refreshList, restoreRecord, onForeignRecord, store]);

  const saveCurrentConversation = useCallback(
    (updatedAt?: number): Promise<void> => {
      const chatHistory = getChatHistory();

      // Nothing to write, so leave any pending fork signal alone. A fork stopped
      // before it streamed reaches here with empty history but the client it
      // built is still installed, so the next save is that fork continuing and
      // must still branch. Consuming the signal here let that save reuse the
      // source id and overwrite it with the fork's history. clearConversation
      // drops the signal when the conversation goes away.
      if (chatHistory.length === 0) return Promise.resolve();

      const fork = pendingForkRef?.current ?? null;

      if (pendingForkRef) pendingForkRef.current = null;

      // Everything this write is judged on is captured here, synchronously, at
      // call time — before any await can move the conversation out from under it.
      const snapshot = store.beginSave(fork != null);

      if (!snapshot) return Promise.resolve();

      // Copy the settings now, not inside the queued body. Switching or
      // starting a conversation mid-stream replaces metaRef before the body
      // runs, and this write would then stamp the incoming conversation's
      // model and provider onto the outgoing one's row.
      const refs = {
        id: snapshot.id,
        ...(store.metaRef.current ?? DEFAULT_META),
      };

      // Queue behind any save already in flight. A fork's first save persists
      // the branch linkage; later saves of that id recover it by reading the
      // record back. Run concurrently, a later save's read could resolve before
      // the fork save's write landed — dropping the linkage and orphaning the
      // branch. The queue makes read-after-write deterministic.
      return store.enqueue(async () => {
        try {
          const record = await buildConversationSaveRecord({
            id: snapshot.id,
            reuseId: snapshot.reuseId,
            fork,
            refs,
            chatHistory,
            updatedAt,
          });

          // When saving a fork, protect the whole branch family it joins so the
          // conversation-cap LRU can't evict the trunk this branch points back to
          // — or any sibling, which would orphan the family's ‹ n/m › navigation.
          const protectedIds =
            fork != null
              ? await forkProtectedIds(record, snapshot.sourceId)
              : undefined;

          const result = await saveConversation(record, {
            protectedIds,
            expectPersisted: snapshot.expectPersisted,
          });

          // Refused, not failed: the row is gone — another tab deleted it, or
          // an import's limit trim evicted it — and the transaction won't write
          // a deleted conversation back. The slot stays as it was, so an undo
          // that restores the row lets the next save land again.
          if (!result.saved) {
            limit.showSaveRefused();

            return;
          }

          store.markPersisted(snapshot, record);
          limit.showLimitNotification(result);
          await refreshList();
        } catch (error) {
          // App.tsx fire-and-forgets this call, so surface the failure here
          // instead of letting it become an unhandled rejection
          console.error("Failed to save conversation", error);
          limit.showSaveError(error);
        }
      });
    },
    [getChatHistory, refreshList, limit, pendingForkRef, store],
  );

  const switchConversation = useCallback(
    async (id: string) => {
      const record = await loadConversation(id);

      if (!record) {
        store.reset();

        return;
      }

      if (record.sessionType === "voice") {
        // Voice records can't replay through the chat hook. Hand off to the
        // parent, which switches modes so the voice hook can take over.
        // Update the URL hash to the foreign id *before* the mode swap so
        // the freshly-mounted voice hook picks it up from the hash on mount.
        if (onForeignRecord) {
          store.adopt(record);
          onForeignRecord(record);
        } else store.reset();

        return;
      }

      clearConversation();
      restoreRecord(record);
      store.adopt(record);
      // Re-collapse with the new active id so its family's row reflects — and
      // highlights — the sibling just switched to (e.g. via the branch arrows).
      await refreshList();
    },
    [clearConversation, restoreRecord, onForeignRecord, refreshList, store],
  );

  const startNewConversation = useCallback(() => {
    clearConversation();
    store.reset();
  }, [clearConversation, store]);

  // A fork branches off the active conversation, minting its id inside the save.
  // With that conversation going away there is nothing left to branch from, so
  // drop the signal before the teardown autosave reads it — otherwise that save
  // writes a sibling of the doomed record and moves the active id onto it.
  const dropPendingFork = useCallback(() => {
    if (pendingForkRef) pendingForkRef.current = null;
  }, [pendingForkRef]);

  const deleteConversation = useCallback(
    async (id: string) => {
      // Take the conversation out of play before any async work. handleDelete
      // calls stopResponse() first, which flips isAssistantResponding and — from
      // a passive effect — fires one more autosave for this conversation after
      // the drain below has already captured the queue. Marked deleted, that
      // save never starts.
      const isLive = id === store.activeId();
      let undoMark: (() => void) | null = null;

      if (isLive) {
        dropPendingFork();
        undoMark = store.markDeleted();
      }

      // Drain the saves already queued before removing the row, so one can't
      // land afterward. drain() never rejects, so awaiting it here — outside
      // the try below — can't strand the mark.
      await store.drain();

      try {
        await deleteConversationWithSnapshot(id, undoDelete.pushDeleted);
      } catch (error) {
        // The row survived, so the conversation is live again — leaving it
        // marked deleted would make a listed conversation unsaveable.
        undoMark?.();
        throw error;
      }

      // Ask again rather than trusting isLive: the user can switch conversations
      // while the delete runs, and tearing the view down then would throw away
      // the one they just opened. liveId, not activeId — a marked slot reports
      // no active id, so the untouched case has to be recognized by id.
      if (store.liveId() === id) {
        clearConversation();
        store.reset();
      }

      await refreshList();
    },
    [clearConversation, refreshList, undoDelete, dropPendingFork, store],
  );

  const { deleteAllConversations, deleteUnbookmarkedConversations } =
    useBulkDeletes({
      store,
      clearConversation,
      refreshList,
      dropPendingFork,
      dropUndoable: undoDelete.dropUndoable,
    });

  const renameConversation = useCallback(
    async (id: string, title: string | null) => {
      await dbRenameConversation(id, title);

      if (id === store.activeId() && store.metaRef.current) {
        store.metaRef.current.title = title;
      }

      await refreshList();
    },
    [refreshList, store],
  );

  const toggleBookmark = useCallback(
    async (id: string) => {
      const conv = conversations.find((c) => c.id === id);

      if (!conv) return;

      const newValue = !conv.bookmarked;

      await setBookmark(id, newValue);

      if (id === store.activeId() && store.metaRef.current) {
        store.metaRef.current.bookmarked = newValue;
      }

      await refreshList();
    },
    [conversations, refreshList, store],
  );

  // Route browser back/forward navigation to the matching conversation.
  useHashNavigation({
    programmaticHashRef,
    activeId: store.activeId,
    switchConversation,
    startNewConversation,
  });

  return {
    conversations,
    activeConversationId,
    ...resolvePanelNotification(undoDelete, limit),
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
 * Ids a fork save must shield from the conversation-cap LRU: the entire branch
 * family the new fork joins (its trunk, the sibling it was forked from, and
 * every other sibling), so trimming to make room can't evict a member and orphan
 * the family's ‹ n/m › navigation.
 * @param record - The fork record being saved
 * @param sourceId - The conversation the fork branched off, if any
 * @returns Ids to protect from limit-based deletion
 */
async function forkProtectedIds(
  record: ConversationRecord,
  sourceId: string | null,
): Promise<ReadonlySet<string>> {
  const seeds = [record.forkParentId, sourceId].filter(
    (id): id is string => id != null,
  );

  return branchFamilyIds(seeds, await listAllConversationSummaries());
}
