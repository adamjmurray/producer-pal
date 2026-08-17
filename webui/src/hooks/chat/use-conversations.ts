// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { reconcileDanglingToolCalls } from "#webui/chat/sdk/build-model-messages";
import { type TransferNotificationData } from "#webui/components/chat/TransferNotification";
import { useLimitNotification } from "#webui/hooks/chat/helpers/notifications/use-limit-notification";
import { useUndoDelete } from "#webui/hooks/chat/helpers/notifications/use-undo-delete";
import {
  type ActiveMeta,
  type ActiveRefs,
  DEFAULT_META,
  buildConversationSaveRecord,
  buildLockedSettings,
  chainSave,
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
  type ConversationLockedSettings,
  type PendingForkRef,
} from "#webui/hooks/chat/use-chat-types";
import { branchFamilyIds } from "#webui/lib/conversation-branch-helpers";
import {
  type ConversationRecord,
  type ConversationSummary,
  deleteAllConversations as dbDeleteAllConversations,
  deleteUnbookmarkedConversations as dbDeleteUnbookmarkedConversations,
  listAllConversationSummaries,
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
  /**
   * The active conversation's locked metadata (model/provider/thinking/etc. plus
   * the resolved system instruction), mirrored into a ref and snapshotted onto
   * saved records.
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
 * Active conversation ID is stored in the URL hash for browser back/forward support.
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
  // activeIdRef is kept in lockstep with state by every setter below
  // (setActiveId / clearActiveId), so no effect-sync is needed.
  const activeIdRef = useRef(activeConversationId);
  const activeMetaRef = useRef<ActiveMeta | null>(null);
  const programmaticHashRef = useRef(false);
  // Serializes conversation saves so a later save's read-back can't race ahead
  // of an earlier save's write (see saveCurrentConversation).
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  // Ids whose pending/in-flight save must be abandoned because the row was
  // deleted. The delete paths drain saveChainRef, but that only covers saves
  // already queued — a save enqueued *after* the drain (chiefly the
  // stream-teardown autosave effect that stopResponse() triggers) would still
  // resurrect the just-deleted row. Every save checks this set right before its
  // DB write and bails. Mirrors the voice layer's canceledIdsRef guard.
  const canceledIdsRef = useRef<Set<string>>(new Set());
  // Id reserved by a bulk delete for a brand-new conversation streaming its
  // first turn but not yet saved (activeIdRef still null). Such a conversation's
  // id is minted — fresh and uncancelable — inside the teardown autosave the
  // delete triggers, so canceling activeIdRef (null) misses it and the save
  // resurrects the just-cleared row. The bulk-delete paths reserve the id here
  // and cancel it; saveCurrentConversation adopts it when minting a brand-new
  // id, so the canceledIds guard catches that teardown save. Unlike the voice
  // layer's same-named ref (held for the whole live session), this is non-null
  // only transiently during a bulk delete — every setActiveId/clearActiveId
  // clears it, so a canceled reservation never leaks into the next brand-new
  // conversation's save. Mirrors the voice layer's pendingNewIdRef.
  const pendingNewIdRef = useRef<string | null>(null);

  useSyncActiveMeta(activeMetaRef, activeMeta);

  const refreshList = useCallback(async () => {
    // Pass the active id so its branch family is represented by the conversation
    // being viewed — keeps the sidebar highlight (and bookmark state) on the
    // active sibling even when it isn't the family's most recent member.
    const list = await listConversations(activeIdRef.current);

    setConversations(list);
  }, []);

  // Un-cancel a restored conversation's id. canceledIdsRef is otherwise
  // add-only; undo restores under the same id via a raw saveConversation that
  // bypasses the guard, but the stale canceled flag would then bail every later
  // autosave for that id at the check below (line ~254), silently losing all
  // post-undo messages. Clearing it on a successful restore re-enables saving.
  const uncancelRestoredId = useCallback((id: string) => {
    canceledIdsRef.current.delete(id);
  }, []);

  const undoDelete = useUndoDelete(refreshList, uncancelRestoredId);

  const setActiveId = useCallback((id: string | null) => {
    setActiveConversationId(id);
    activeIdRef.current = id;
    // The active id now owns this conversation, so any bulk-delete reservation
    // is spent — clear it (see pendingNewIdRef) before it can leak into a later
    // brand-new save.
    pendingNewIdRef.current = null;
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
    // Drop any bulk-delete reservation (see pendingNewIdRef) so a canceled id
    // can't be adopted by the next brand-new conversation.
    pendingNewIdRef.current = null;
    // No programmaticHashRef here — setLocationHash(null) uses replaceState
    // which doesn't fire hashchange, so no guard is needed
    setLocationHash(null);
  }, []);

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

      if (hashId) {
        const record = await loadConversation(hashId);

        if (record?.sessionType === "voice") {
          if (onForeignRecord) onForeignRecord(record);
          else clearActiveId();

          return;
        }

        if (record && record.messages.length > 0) {
          setActiveId(hashId);
          restoreRecord(record);
          syncMetaRef(activeMetaRef, record);
        } else {
          // Hash ID no longer exists in DB
          clearActiveId();
        }
      }
    };

    void init();
  }, [refreshList, restoreRecord, setActiveId, clearActiveId, onForeignRecord]);

  const saveCurrentConversation = useCallback(
    (updatedAt?: number): Promise<void> => {
      // Consume the fork signal first — before the empty-history early-return
      // below. A fork aborted before it streamed any content (Stop, or a browser
      // Back/Forward tearing the conversation down) reaches here with empty
      // history; consuming the signal here rather than after the return keeps it
      // from lingering and mis-branching the next, unrelated save. Forking needs
      // a saved source (the active record) to preserve; with no active id it
      // degrades to a normal save of the forked history as a fresh chat.
      const fork = pendingForkRef?.current ?? null;

      if (pendingForkRef) pendingForkRef.current = null;

      const chatHistory = getChatHistory();

      if (chatHistory.length === 0) return Promise.resolve();

      const reuseId = activeIdRef.current;
      // A fork mints a new id and switches to it (leaving the source intact); a
      // normal save reuses the active id. A brand-new chat adopts an id a bulk
      // delete may have reserved (pendingNewIdRef) so the delete's guard can
      // cancel this save, otherwise mints a fresh one. Set synchronously before
      // any async work so concurrent saves hit this id.
      const id =
        fork != null
          ? crypto.randomUUID()
          : (reuseId ?? pendingNewIdRef.current ?? crypto.randomUUID());

      setActiveId(id);

      // Serialize the DB work behind any in-flight save. A fork's first save
      // persists the branch linkage; later saves of that id recover it by reading
      // the record back. Run concurrently, a later save's read could resolve
      // before the fork save's write landed — dropping the linkage and orphaning
      // the branch. Chaining makes the read-after-write ordering deterministic;
      // the fork signal is still consumed synchronously above, at call time.
      // chainSave runs this body after any in-flight save; its errors are
      // swallowed below so the chain never rejects.
      return chainSave(saveChainRef, async () => {
        try {
          const record = await buildConversationSaveRecord({
            id,
            reuseId,
            fork,
            refs: buildActiveRefs(activeMetaRef, id),
            chatHistory,
            updatedAt,
          });

          syncMetaRef(activeMetaRef, record);

          // When saving a fork, protect the whole branch family it joins so the
          // conversation-cap LRU can't evict the trunk this branch points back to
          // — or any sibling, which would orphan the family's ‹ n/m › navigation.
          const protectedIds =
            fork != null ? await forkProtectedIds(record, reuseId) : undefined;

          // A delete for this id can land while this save was queued or while
          // the awaits above resolved. Check as late as possible — right before
          // the write — so a just-deleted conversation isn't resurrected.
          if (canceledIdsRef.current.has(id)) return;

          const result = await saveConversation(record, protectedIds);

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
    [getChatHistory, refreshList, setActiveId, limit, pendingForkRef],
  );

  const switchConversation = useCallback(
    async (id: string) => {
      const record = await loadConversation(id);

      if (!record) {
        clearActiveId();

        return;
      }

      if (record.sessionType === "voice") {
        // Voice records can't replay through the chat hook. Hand off to the
        // parent, which switches modes so the voice hook can take over.
        // Update the URL hash to the foreign id *before* the mode swap so
        // the freshly-mounted voice hook picks it up from the hash on mount.
        if (onForeignRecord) {
          setActiveId(id);
          onForeignRecord(record);
        } else clearActiveId();

        return;
      }

      clearConversation();
      restoreRecord(record);
      setActiveId(id);
      syncMetaRef(activeMetaRef, record);
      // Re-collapse with the new active id so its family's row reflects — and
      // highlights — the sibling just switched to (e.g. via the branch arrows).
      await refreshList();
    },
    [
      clearConversation,
      clearActiveId,
      restoreRecord,
      setActiveId,
      onForeignRecord,
      refreshList,
    ],
  );

  const startNewConversation = useCallback(() => {
    clearConversation();
    clearActiveId();
  }, [clearConversation, clearActiveId]);

  const deleteConversation = useCallback(
    async (id: string) => {
      // Mark this id canceled before any async work. handleDelete calls
      // stopResponse() first, which flips isAssistantResponding and — from a
      // passive effect — fires one more autosave for this id *after* the drain
      // below has already captured the save chain. That late save would
      // otherwise resurrect the row; instead it checks canceledIdsRef right
      // before its write and bails.
      canceledIdsRef.current.add(id);
      // Drain any autosave already in flight before removing the row, so its
      // write can't land afterward and resurrect the record. The save chain
      // never rejects (saveCurrentConversation's chained body swallows its own
      // errors), so awaiting it directly is safe.
      await saveChainRef.current;
      await deleteConversationWithSnapshot(id, undoDelete.pushDeleted);

      if (activeIdRef.current === id) {
        clearConversation();
        clearActiveId();
      }

      await refreshList();
    },
    [clearConversation, clearActiveId, refreshList, undoDelete],
  );

  const deleteAllConversations = useCallback(async () => {
    // Cancel the active (streaming) conversation's pending/in-flight autosave,
    // then drain the chain, mirroring deleteConversation. handleDeleteAll stops
    // the stream first, so the two producers are the in-flight save (the drain
    // covers it) and the stream-teardown autosave effect (the id guard covers
    // it). A brand-new chat streaming its first turn has no active id yet — its
    // id is minted lazily inside that teardown save — so reserve it here
    // (pendingNewIdRef) and cancel that; the save adopts the reserved id instead
    // of a fresh uncancelable one. Either way the just-cleared row can't be
    // resurrected.
    const activeId = activeIdRef.current;
    const liveId = activeId ?? (pendingNewIdRef.current = crypto.randomUUID());

    canceledIdsRef.current.add(liveId);

    await saveChainRef.current;
    await dbDeleteAllConversations();
    clearConversation();
    clearActiveId();
    await refreshList();
  }, [clearConversation, clearActiveId, refreshList]);

  const deleteUnbookmarkedConversations = useCallback(async () => {
    // The active conversation is removed only when it's unbookmarked. A
    // brand-new chat streaming its first turn (no active id yet) is implicitly
    // unbookmarked, so it's swept too — reserve its lazily-minted id
    // (pendingNewIdRef) so the teardown autosave adopts it and the guard cancels
    // it. When it clears, cancel that live id (same resurrection guard as the
    // other delete paths); a bookmarked active conversation survives, so its
    // save must still land — hence the conditional add but unconditional drain.
    const activeId = activeIdRef.current;
    const liveId = activeId ?? (pendingNewIdRef.current = crypto.randomUUID());
    const clearsActive = activeId == null || !activeMetaRef.current?.bookmarked;

    if (clearsActive) canceledIdsRef.current.add(liveId);

    await saveChainRef.current;
    await dbDeleteUnbookmarkedConversations();

    if (clearsActive) {
      clearConversation();
      clearActiveId();
    }

    await refreshList();
  }, [clearConversation, clearActiveId, refreshList]);

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

  // Route browser back/forward navigation to the matching conversation.
  useHashNavigation({
    programmaticHashRef,
    activeIdRef,
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
 * Build the active-refs snapshot (id plus the cached active metadata) used to
 * carry settings/title/bookmark onto a save record.
 * @param activeMetaRef - Ref holding the active conversation's metadata
 * @param activeMetaRef.current - Current metadata, or null when none is active
 * @param id - Id to stamp on the refs
 * @returns Active refs for buildConversationSaveRecord
 */
function buildActiveRefs(
  activeMetaRef: { current: ActiveMeta | null },
  id: string,
): ActiveRefs {
  return { id, ...(activeMetaRef.current ?? DEFAULT_META) };
}

/**
 * Ids a fork save must shield from the conversation-cap LRU: the entire branch
 * family the new fork joins (its trunk, the sibling it was forked from, and
 * every other sibling), so trimming to make room can't evict a member and orphan
 * the family's ‹ n/m › navigation.
 * @param record - The fork record being saved
 * @param reuseId - The active id the fork was created from, if any
 * @returns Ids to protect from limit-based deletion
 */
async function forkProtectedIds(
  record: ConversationRecord,
  reuseId: string | null,
): Promise<ReadonlySet<string>> {
  const seeds = [record.forkParentId, reuseId].filter(
    (id): id is string => id != null,
  );

  return branchFamilyIds(seeds, await listAllConversationSummaries());
}

/**
 * Overwrite the active-meta ref from a freshly loaded conversation record.
 * @param ref - Ref holding the active-meta object
 * @param ref.current - Mutable slot updated in place
 * @param record - Conversation record to copy metadata from
 */
function syncMetaRef(
  ref: { current: ActiveMeta | null },
  record: ConversationRecord,
): void {
  ref.current = {
    title: record.title,
    createdAt: record.createdAt,
    bookmarked: record.bookmarked,
    model: record.model,
    provider: record.provider as Provider | null,
    thinking: record.thinking,
    smallModelMode: record.smallModelMode ?? null,
    systemInstruction: record.systemInstruction ?? null,
    notation: record.notation ?? null,
    enabledTools: record.enabledTools ?? null,
  };
}
