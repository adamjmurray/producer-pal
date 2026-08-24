// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useCallback } from "preact/hooks";
import { type ActiveMeta } from "#webui/hooks/chat/helpers/conversations/use-conversations-helpers";
import {
  type ConversationRecord,
  deleteAllConversations as dbDeleteAllConversations,
  deleteUnbookmarkedConversations as dbDeleteUnbookmarkedConversations,
} from "#webui/lib/conversation-db";

/** The useConversations state the bulk deletes read and write. */
export interface BulkDeleteParams {
  activeIdRef: { current: string | null };
  activeMetaRef: { current: ActiveMeta | null };
  /** Id reserved for a brand-new conversation whose save hasn't minted one yet. */
  pendingNewIdRef: { current: string | null };
  /** Ids whose pending/in-flight save must be abandoned. */
  canceledIdsRef: { current: Set<string> };
  /** The serialized save chain, awaited to drain saves already in flight. */
  saveChainRef: { current: Promise<void> };
  clearConversation: () => void;
  clearActiveId: () => void;
  refreshList: () => Promise<void>;
  /** Drops a pending fork signal so a teardown save can't branch off a doomed record. */
  dropPendingFork: () => void;
  /** Drops the pending undos this sweep has just invalidated. */
  dropUndoable: (shouldDrop: (record: ConversationRecord) => boolean) => void;
}

export interface BulkDeletes {
  deleteAllConversations: () => Promise<void>;
  deleteUnbookmarkedConversations: () => Promise<void>;
}

/**
 * The delete-everything and delete-unbookmarked sweeps.
 *
 * Both mirror deleteConversation's guards: cancel the live conversation's
 * pending/in-flight autosave, drain the save chain, sweep, then clear the view.
 * The caller stops the stream first, so the two save producers are the in-flight
 * save (the drain covers it) and the stream-teardown autosave effect (the id
 * guard covers it). A brand-new chat streaming its first turn has no active id
 * yet — its id is minted lazily inside that teardown save — so reserve it here
 * (pendingNewIdRef) and cancel that; the save adopts the reserved id instead of
 * a fresh uncancelable one. Either way the just-cleared row can't be resurrected.
 *
 * Each sweep also drops the pending undos it invalidates. The undo banner never
 * auto-expires, so a "Deleted X / Undo" left over from a single delete would
 * otherwise sit there after a wipe and put X back on one click.
 *
 * @param params - The useConversations refs and callbacks these sweeps operate on
 * @returns The two bulk-delete handlers
 */
export function useBulkDeletes(params: BulkDeleteParams): BulkDeletes {
  const {
    activeIdRef,
    activeMetaRef,
    pendingNewIdRef,
    canceledIdsRef,
    saveChainRef,
    clearConversation,
    clearActiveId,
    refreshList,
    dropPendingFork,
    dropUndoable,
  } = params;

  const deleteAllConversations = useCallback(async () => {
    const activeId = activeIdRef.current;
    const liveId = activeId ?? (pendingNewIdRef.current = crypto.randomUUID());

    canceledIdsRef.current.add(liveId);
    dropPendingFork();
    dropUndoable(() => true);

    await saveChainRef.current;
    await dbDeleteAllConversations();
    clearConversation();
    clearActiveId();
    await refreshList();
  }, [
    activeIdRef,
    pendingNewIdRef,
    canceledIdsRef,
    saveChainRef,
    clearConversation,
    clearActiveId,
    refreshList,
    dropPendingFork,
    dropUndoable,
  ]);

  const deleteUnbookmarkedConversations = useCallback(async () => {
    // The active conversation is removed only when it's unbookmarked, and a
    // brand-new chat is implicitly unbookmarked so it's swept too. A bookmarked
    // active conversation survives, so its save must still land — hence the
    // conditional cancel but unconditional drain.
    const activeId = activeIdRef.current;
    const liveId = activeId ?? (pendingNewIdRef.current = crypto.randomUUID());
    const clearsActive = activeId == null || !activeMetaRef.current?.bookmarked;

    if (clearsActive) {
      canceledIdsRef.current.add(liveId);
      dropPendingFork();
    }

    // Bookmarked records survive this sweep, so their undos stay offerable.
    dropUndoable((record) => !record.bookmarked);

    await saveChainRef.current;
    await dbDeleteUnbookmarkedConversations();

    if (clearsActive) {
      clearConversation();
      clearActiveId();
    }

    await refreshList();
  }, [
    activeIdRef,
    activeMetaRef,
    pendingNewIdRef,
    canceledIdsRef,
    saveChainRef,
    clearConversation,
    clearActiveId,
    refreshList,
    dropPendingFork,
    dropUndoable,
  ]);

  return { deleteAllConversations, deleteUnbookmarkedConversations };
}
